import express, { Router } from 'express';
import { createScheduledPost, getScheduledPosts, getScheduledPostById, deleteScheduledPost, updateScheduledPost, publishScheduledPost } from '../controllers/scheduled-post.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router: Router = express.Router();

// All routes are protected
router.use(authMiddleware);

// Create a new scheduled post
router.post('/', createScheduledPost as any);

// Get all scheduled posts for the authenticated user
router.get('/', getScheduledPosts as any);

// Get a single scheduled post by ID
router.get('/:id', getScheduledPostById as any);

// Delete a scheduled post
router.delete('/:id', deleteScheduledPost as any);

// Update a scheduled post
router.put('/:id', updateScheduledPost as any);

// Publish a scheduled post immediately
router.post('/:id/publish', publishScheduledPost as any);

export default router; 