import { Router } from 'express';
import { authMiddleware as authenticateJWT } from '../middlewares/auth.middleware';
import * as autoPostingController from '../controllers/autoposting.controller';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);

// Get all autoposting rules
router.get('/rules', autoPostingController.getAutoPostingRules);

// Get a specific autoposting rule
router.get('/rules/:id', autoPostingController.getAutoPostingRuleById);

// Create a new autoposting rule
router.post('/rules', autoPostingController.createAutoPostingRule);

// Update an existing autoposting rule
router.put('/rules/:id', autoPostingController.updateAutoPostingRule);

// Delete an autoposting rule
router.delete('/rules/:id', autoPostingController.deleteAutoPostingRule);

// Get autoposting history
router.get('/history', autoPostingController.getAutoPostingHistory);

// Execute an autoposting rule (manual trigger)
router.post('/rules/:id/execute', autoPostingController.executeAutoPostingRule);

export default router; 