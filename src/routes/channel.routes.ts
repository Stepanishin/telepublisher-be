import express, { Router } from 'express';
import {
  getUserChannels,
  addChannel,
  updateChannel,
  deleteChannel,
  getChannelLimits
} from '../controllers/channel.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router: Router = express.Router();

// Все маршруты защищены middleware аутентификации
router.use(authMiddleware);

// Получить все каналы пользователя
router.get('/', getUserChannels);

// Получить информацию о лимитах каналов
router.get('/limits', getChannelLimits);

// Добавить новый канал
router.post('/', addChannel);

// Обновить канал
router.put('/:channelId', updateChannel);

// Удалить канал
router.delete('/:channelId', deleteChannel);

export default router; 