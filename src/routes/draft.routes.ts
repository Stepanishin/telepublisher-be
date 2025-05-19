import express, { Router } from 'express';
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
import { upload } from '../controllers/upload.controller';

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

// Upload an image for a draft
router.post('/upload-image', upload.single('image'), uploadDraftImage);

export default router; 