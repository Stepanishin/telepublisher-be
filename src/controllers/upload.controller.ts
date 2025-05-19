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