import express from 'express';
import { 
  generateText, 
  generateTags, 
  generateImage, 
  generateTextFromImage, 
  generateImageFromImage 
} from '../controllers/ai.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = express.Router();

// All AI routes require authentication
router.use(authMiddleware);

// Text generation route
router.post('/generate-text', generateText as unknown as express.RequestHandler);

// Tags generation route
router.post('/generate-tags', generateTags as unknown as express.RequestHandler);

// Image generation route
router.post('/generate-image', generateImage as unknown as express.RequestHandler);

// Text generation from image route
router.post('/generate-text-from-image', generateTextFromImage as unknown as express.RequestHandler);

// Image generation based on reference image
router.post('/generate-image-from-image', generateImageFromImage as unknown as express.RequestHandler);

export default router; 