import express, { Router } from 'express';
import { createScheduledPoll, getScheduledPolls, getScheduledPollById, deleteScheduledPoll, updateScheduledPoll, publishScheduledPoll } from '../controllers/scheduled-poll.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router: Router = express.Router();

// All routes are protected
router.use(authMiddleware);

// Create a new scheduled poll
router.post('/', createScheduledPoll as any);

// Get all scheduled polls for the authenticated user
router.get('/', getScheduledPolls as any);

// Get a single scheduled poll by ID
router.get('/:id', getScheduledPollById as any);

// Delete a scheduled poll
router.delete('/:id', deleteScheduledPoll as any);

// Update a scheduled poll
router.put('/:id', updateScheduledPoll as any);

// Publish a scheduled poll immediately
router.post('/:id/publish', publishScheduledPoll as any);

export default router; 