import express, { Router } from 'express';
import { getCurrentUser } from '../controllers/user.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router: Router = express.Router();

// Protected routes
router.get('/me', authMiddleware, getCurrentUser);

export default router; 