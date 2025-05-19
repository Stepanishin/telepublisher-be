import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Создадим папку uploads/drafts, если её нет
const draftsDir = path.join(__dirname, '../../uploads/drafts');
if (!fs.existsSync(draftsDir)) {
  fs.mkdirSync(draftsDir, { recursive: true });
}

// Определение корневых папок uploads
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create metadata directory to store image timestamps
const metadataDir = path.join(__dirname, '../../uploads/.metadata');
if (!fs.existsSync(metadataDir)) {
  fs.mkdirSync(metadataDir, { recursive: true });
}

// Общие настройки multer для проверки типов файлов
const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  // Проверка типа файла
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Недопустимый формат файла. Допускаются только изображения (JPEG, PNG, GIF, WebP)'));
  }
};

// Настройка multer для ОБЫЧНЫХ изображений (не черновиков)
const regularStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: Function) => {
    console.log('Saving regular image to:', uploadsDir);
    cb(null, uploadsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: Function) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Настройка multer для ЧЕРНОВИКОВ
const draftsStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: Function) => {
    console.log('Saving draft image to:', draftsDir);
    cb(null, draftsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: Function) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Создаем два экземпляра multer с одинаковыми ограничениями, но разными местами хранения
export const uploadRegular = multer({
  storage: regularStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Максимальный размер 10MB
  },
  fileFilter
});

export const uploadDraft = multer({
  storage: draftsStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Максимальный размер 10MB
  },
  fileFilter
});

// Экспортируем общий объект для обратной совместимости
// Предупреждение! Этот метод загрузки не использовать для новых маршрутов!
// В новых маршрутах используйте либо uploadRegular, либо uploadDraft
export const upload = uploadRegular;

/**
 * Creates a timestamp file for tracking regular upload images
 * @param filename The image filename to create a timestamp for
 */
const createTimestampFile = (filename: string): void => {
  try {
    const timestampPath = path.join(metadataDir, `${filename}.meta`);
    const timestamp = new Date().toISOString();
    fs.writeFileSync(timestampPath, timestamp);
    console.log(`Created timestamp file for ${filename}`);
  } catch (error) {
    console.error(`Error creating timestamp file for ${filename}:`, error);
  }
};

/**
 * Проверяет, находится ли файл в директории черновиков
 * @param filePath Путь к файлу
 * @returns Находится ли файл в директории черновиков
 */
const isInDraftsDirectory = (filePath: string): boolean => {
  const normalizedPath = path.normalize(filePath);
  const normalizedDraftsDir = path.normalize(draftsDir);
  return normalizedPath.startsWith(normalizedDraftsDir);
};

// Используем локальное хранение файлов вместо внешнего сервиса
export const uploadImageToExternalService = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'Изображение отсутствует'
      });
      return;
    }

    // Путь к загруженному файлу
    const filePath = req.file.path;
    
    // Формируем URL к загруженному файлу
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? process.env.API_BASE_URL || req.protocol + '://' + req.get('host')
      : 'http://localhost:' + (process.env.PORT || 5000);
    
    // Путь относительно корня проекта
    const relativePath = path.relative(path.join(__dirname, '../..'), filePath).replace(/\\/g, '/');
    const imageUrl = `${baseUrl}/${relativePath}`;

    // Определяем, является ли это файлом черновика по его фактическому расположению
    const isDraftImage = isInDraftsDirectory(filePath);
    
    console.log(`File path: ${filePath}`);
    console.log(`Is draft image: ${isDraftImage} (by directory check)`);
    
    // Create timestamp file ONLY for regular uploads (not drafts)
    if (!isDraftImage) {
      console.log(`Creating timestamp for regular upload: ${req.file.filename}`);
      createTimestampFile(req.file.filename);
    } else {
      console.log(`Skipping timestamp creation for draft image: ${req.file.filename}`);
    }
    
    // Возвращаем URL к загруженному изображению
    res.status(200).json({
      success: true,
      imageUrl: imageUrl
    });
    
  } catch (error) {
    console.error('Error uploading image:', error);
    
    // Если есть загруженный файл, удаляем его в случае ошибки
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Ошибка при загрузке изображения'
    });
  }
};

// Функция для удаления изображения с сервера
export const deleteImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = req.params.filename;
    
    if (!filename) {
      res.status(400).json({
        success: false,
        message: 'Имя файла отсутствует'
      });
      return;
    }

    // Проверяем безопасность имени файла (защита от path traversal)
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      res.status(400).json({
        success: false,
        message: 'Недопустимое имя файла'
      });
      return;
    }
    
    // Проверяем существование файла в обоих каталогах
    const regularFilePath = path.join(uploadsDir, filename);
    const draftsFilePath = path.join(draftsDir, filename);
    
    let fileExists = false;
    let filePath = '';
    let isDraft = false;
    
    // Проверяем, существует ли файл в основной папке uploads
    if (fs.existsSync(regularFilePath)) {
      fileExists = true;
      filePath = regularFilePath;
      isDraft = false;
    } 
    // Если нет, проверяем в папке drafts
    else if (fs.existsSync(draftsFilePath)) {
      fileExists = true;
      filePath = draftsFilePath;
      isDraft = true;
    }
    
    if (!fileExists) {
      res.status(404).json({
        success: false,
        message: 'Файл не найден'
      });
      return;
    }
    
    // Удаляем файл
    fs.unlinkSync(filePath);
    
    // Also remove the timestamp file if this is a regular upload
    if (!isDraft) {
      const timestampPath = path.join(metadataDir, `${filename}.meta`);
      if (fs.existsSync(timestampPath)) {
        fs.unlinkSync(timestampPath);
        console.log(`Deleted timestamp file for ${filename}`);
      }
    }
    
    // Отправляем успешный ответ
    res.status(200).json({
      success: true,
      message: 'Изображение успешно удалено'
    });
    
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Ошибка при удалении изображения'
    });
  }
}; 