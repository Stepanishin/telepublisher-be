import express from 'express';
import { getCreditInfo, useCredits, addCredits, updateSubscription } from '../controllers/credit.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = express.Router();

// Все маршруты для кредитов требуют аутентификации
router.use(authMiddleware);

// Получение информации о кредитах пользователя
router.get('/info', getCreditInfo as unknown as express.RequestHandler);

// Использование кредитов
router.post('/use', useCredits as unknown as express.RequestHandler);

// Добавление кредитов (для админов или после оплаты)
router.post('/add', addCredits as unknown as express.RequestHandler);

// Обновление подписки
router.post('/subscription', updateSubscription as unknown as express.RequestHandler);

export default router; 