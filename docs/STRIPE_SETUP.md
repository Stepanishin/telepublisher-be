# Stripe Integration Setup

This document outlines how to set up and configure Stripe payments for the Telepublisher application.

## Prerequisites

1. A Stripe account (create one at [stripe.com](https://stripe.com))
2. Node.js and npm installed

## Configuration Steps

### 1. Set up environment variables

Add the following variables to your `.env` file in the server directory:

```
# Stripe Test Keys
STRIPE_PUBLISHABLE_KEY_TEST=
STRIPE_SECRET_KEY_TEST=

# Stripe Live Keys
STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=

# Stripe Webhook
STRIPE_WEBHOOK_SECRET=
```

### 2. Install required dependencies

```bash
# Server dependencies
cd server
npm install stripe

# Client dependencies
cd ../client
npm install react-hot-toast
```

### 3. Set up Stripe products and prices

1. Log in to your Stripe Dashboard
2. Navigate to Products > Add Product
3. Create the following products with monthly recurring prices:

| Name           | Price ($) | Product ID     | Price ID       |
|----------------|-------------|----------------|----------------|
| Basic          | 10        | prod_basic     | price_test_basic     |
| Business       | 30        | prod_business  | price_test_business  |

4. Note the Product and Price IDs and update them in `server/src/services/stripe.service.ts`

### 4. Configure webhooks

1. In the Stripe Dashboard, go to Developers > Webhooks
2. Add an endpoint with URL: `https://your-domain.com/api/stripe/webhook`
3. Select the following events to listen for:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.deleted`
4. Copy the Signing Secret and update your `.env` file with `STRIPE_WEBHOOK_SECRET`

### 5. Testing

To test the integration:

1. Use Stripe test mode (default when using test keys)
2. Use Stripe test cards:
   - `4242 4242 4242 4242` - Successful payment
   - `4000 0000 0000 0002` - Declined payment

## Notes

- The integration uses Stripe Checkout for a secure, hosted payment page
- The Customer Portal allows users to manage their subscriptions 
- Webhooks handle subscription lifecycle events (creation, renewal, cancellation)
- Credit allocation is managed by the `CreditService` based on subscription type

## Troubleshooting

- Check Stripe Dashboard > Developers > Logs for webhook delivery issues
- Ensure your server is accessible from the internet for webhooks to work
- For local development, use the Stripe CLI to forward webhook events 