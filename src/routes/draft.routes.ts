import express, { Router, Request, Response, NextFunction } from 'express';
import { 
  getDrafts, 
  getDraftById, 
  createDraft, 
  updateDraft, 
  deleteDraft,
  uploadDraftImage,
  getStorageInfo
} from '../controllers/draft.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { uploadDraft } from '../controllers/upload.controller';

const router: Router = express.Router();

// All draft routes require authentication
router.use(authMiddleware);

// Get storage info for the current user
router.get('/storage-info', getStorageInfo);

// Get all drafts for the current user
router.get('/', getDrafts);

// Get a specific draft by ID
router.get('/:id', getDraftById);

// Create a new draft
router.post('/', createDraft);

// Update an existing draft
router.put('/:id', updateDraft);

// Delete a draft
router.delete('/:id', deleteDraft);

// Upload an image for a draft - используем uploadDraft для сохранения в правильную папку
router.post('/upload-image', uploadDraft.single('image'), uploadDraftImage);

export default router; 