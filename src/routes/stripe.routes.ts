import express from 'express';
import { 
  createCheckoutSession, 
  handleWebhook, 
  createPortalSession,
  cancelSubscription,
  purchaseTokens
} from '../controllers/stripe.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import bodyParser from 'body-parser';

const router = express.Router();

// For webhook we need the raw body 
// Use express.raw for webhook only
router.post(
  '/webhook', 
  express.raw({ type: 'application/json' }),
  handleWebhook as unknown as express.RequestHandler
);

// All other routes need JSON parsing and authentication
// We need to use JSON body parser specifically for these routes
const jsonParser = express.json();

// Apply authentication middleware for non-webhook routes
router.use((req, res, next) => {
  // Skip auth and JSON parsing for webhook route
  if (req.path === '/webhook') {
    return next();
  }
  
  // For all other routes, parse JSON body and apply auth
  jsonParser(req, res, (err) => {
    if (err) return next(err);
    authMiddleware(req, res, next);
  });
});

// Create a checkout session
router.post('/create-checkout-session', createCheckoutSession as unknown as express.RequestHandler);

// Create a customer portal session
router.post('/create-portal-session', createPortalSession as unknown as express.RequestHandler);

// Cancel a subscription
router.post('/cancel-subscription', cancelSubscription as unknown as express.RequestHandler);

// Purchase AI tokens
router.post('/purchase-tokens', purchaseTokens as unknown as express.RequestHandler);

export default router; 