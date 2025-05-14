import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Настройка multer для обработки загруженных файлов
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: Function) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    
    // Создаем директорию, если её нет
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
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

// Альтернативная реализация с использованием внешних сервисов
// Эту функцию можно использовать вместо uploadImage, если нужно
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
    
    // Создаем FormData для загрузки на внешний сервис
    const formData = new FormData();
    formData.append('image', fs.createReadStream(filePath));
    
    // Используем Imgur API для загрузки изображения
    const response = await axios.post('https://api.imgur.com/3/image', formData, {
      headers: {
        ...formData.getHeaders(),
        // Бесплатный анонимный Client ID для Imgur
        'Authorization': 'Client-ID 546c25a59c58ad7'
      }
    });
    
    // Удаляем временный файл
    fs.unlinkSync(filePath);
    
    if (response.data.success) {
      res.status(200).json({
        success: true,
        imageUrl: response.data.data.link
      });
    } else {
      throw new Error('Не удалось загрузить изображение на внешний сервис');
    }
  } catch (error) {
    console.error('Error uploading image to external service:', error);
    
    // Если есть загруженный файл, удаляем его
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Ошибка при загрузке изображения'
    });
  }
}; 