# Setting Up Stripe Webhooks for TelePublisher

This document explains how to properly configure Stripe webhooks for both development and production environments to ensure subscription updates work correctly.

## Why Webhooks Are Important

Stripe webhooks are essential for subscription management as they notify your application when important events occur, such as:
- When a customer successfully completes a payment
- When a subscription is created or updated
- When a subscription payment fails or is cancelled

**Without properly configured webhooks, the subscription state in your application won't sync with Stripe's subscription state.**

## Production Environment Setup

1. Log into your [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Click "Add Endpoint"
3. Enter your production webhook URL: `https://your-domain.com/api/stripe/webhook`
4. Select the following events to listen for:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
5. Click "Add Endpoint"
6. Copy the "Signing Secret" shown
7. Add this secret to your production environment variables as `STRIPE_WEBHOOK_SECRET`

## Development Environment Setup

For local development, you need to forward webhook events to your local server using the Stripe CLI:

1. [Install the Stripe CLI](https://stripe.com/docs/stripe-cli)
2. Login to your Stripe account:
   ```
   stripe login
   ```
3. Forward events to your local server:
   ```
   stripe listen --forward-to http://localhost:5000/api/stripe/webhook
   ```
4. The CLI will display a webhook signing secret. Copy this value.
5. Set this value as `STRIPE_WEBHOOK_SECRET` in your development environment variables.

## Testing Webhooks

You can trigger webhook events manually for testing:

```
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger customer.subscription.updated
```

You can also test subscription renewal specifically with:

```
# To test renewal of a cancelled subscription
stripe trigger customer.subscription.updated --add cancel_at_period_end:false --override previous_attributes.cancel_at_period_end:true
```

### Verifying Webhook Processing

To verify webhooks are being processed correctly:

1. **Check Stripe CLI logs** - When forwarding webhooks locally, the CLI will show if the event was delivered and the HTTP status code returned by your server.

2. **Server logs** - Look for these logs in your server console:
   ```
   Processing webhook event: checkout.session.completed
   Updated subscription for user: <user_id>
   ```

3. **Test the full payment flow**:
   - Create a checkout session
   - Use Stripe test card `4242 4242 4242 4242` to complete the payment
   - Watch the Stripe CLI and server logs
   - Verify in your database that the user's subscription was updated

4. **Webhook Event Debugging**
   If you're having issues with webhooks not processing, add this code to your webhook handler for debugging:
   
   ```typescript
   // Add to your webhook handler
   console.log('Webhook Headers:', JSON.stringify(req.headers));
   console.log('Stripe-Signature:', req.headers['stripe-signature']);
   console.log('Body type:', typeof req.body);
   console.log('Is Buffer:', Buffer.isBuffer(req.body));
   ```

## Common Issues and Solutions

### Subscription Not Updated After Payment

If the subscription is not updating after a successful payment, check:

1. **Webhook logs in Stripe Dashboard** - Look for delivery failures
2. **Server logs** - Check for webhook handling errors
3. **Webhook signing secret** - Ensure it matches between Stripe and your server
4. **Network accessibility** - Your server must be accessible from the internet for Stripe to deliver webhooks

### Express Middleware Configuration Issues

A common issue is Express middleware parsing the request body before it reaches the webhook handler. Ensure:

1. The webhook route uses `express.raw({ type: 'application/json' })` middleware
2. The webhook route is defined BEFORE any `express.json()` middleware that parses requests
3. The Stripe webhook handling code receives a raw Buffer, not a parsed object

### Testing Without Webhooks

If you need to test without webhooks (NOT RECOMMENDED FOR PRODUCTION):

1. In a development environment only, you can manually update subscriptions after payment using the Stripe Dashboard
2. Check the payment status in Stripe and manually call the updateSubscription API

## Important Notes

- **Never** automatically update subscriptions before payment confirmation
- Always rely on webhooks for subscription state changes
- Use test cards (`4242 4242 4242 4242`) for development testing
- For local development without internet access, consider mocking Stripe API responses

## Troubleshooting

If webhooks are not being received:

1. Check your firewall and network settings
2. Verify the webhook URL is accessible from the internet
3. Check the Stripe Dashboard for webhook delivery attempts
4. Ensure your server is properly parsing and handling the webhook payload
5. Verify the webhook signature validation logic
6. Restart your server after making changes to webhook handling

For additional help, refer to the [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks). 