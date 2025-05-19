import { uploadImageToExternalService as uploadImage, uploadRegular, deleteImage } from '../controllers/upload.controller';
import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = express.Router();

// Маршрут для загрузки изображений
// Используем middleware authMiddleware для проверки авторизации
// и uploadRegular.single('image') для обработки загружаемого файла
router.post('/image', authMiddleware, uploadRegular.single('image'), uploadImage);

// Маршрут для удаления изображений
// Используем middleware authMiddleware для проверки авторизации
router.delete('/image/:filename', authMiddleware, deleteImage);

export default router; 