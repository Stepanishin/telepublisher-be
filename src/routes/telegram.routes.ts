import express, { Router } from 'express';
import { verifyTelegramLogin } from '../controllers/telegram.controller';

const router: Router = express.Router();

// Telegram authentication route
router.post('/auth', verifyTelegramLogin);

export default router; 