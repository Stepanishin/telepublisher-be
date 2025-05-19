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

// Настройка multer для обработки загруженных файлов
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: Function) => {
    // Проверяем URL запроса, чтобы определить, куда сохранять файл
    console.log('Original URL:', req.originalUrl);
    
    if (req.originalUrl.includes('/api/drafts/upload-image')) {
      // Сохраняем в uploads/drafts для маршрута черновиков
      cb(null, draftsDir);
    } else {
      // Для остальных запросов сохраняем в общую папку uploads
      const uploadDir = path.join(__dirname, '../../uploads');
      
      // Создаем директорию, если её нет
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      cb(null, uploadDir);
    }
  },
  filename: (req: Request, file: Express.Multer.File, cb: Function) => {
    // Генерируем уникальное имя файла
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Максимальный размер 10MB
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Проверка типа файла
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый формат файла. Допускаются только изображения (JPEG, PNG, GIF, WebP)'));
    }
  }
});

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

    // Create timestamp file for regular uploads (not drafts)
    if (!req.originalUrl.includes('/api/drafts/upload-image')) {
      createTimestampFile(req.file.filename);
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