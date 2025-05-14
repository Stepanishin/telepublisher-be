import { Request, Response } from 'express';
import StripeService from '../services/stripe.service';
import User from '../models/user.model';
import { SubscriptionType } from '../models/user.model';
import CreditService from '../services/credit.service';

export const createCheckoutSession = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { subscriptionType, successUrl, cancelUrl } = req.body;
    
    if (!subscriptionType || !Object.values(SubscriptionType).includes(subscriptionType)) {
      return res.status(400).json({
        success: false,
        message: 'Укажите корректный тип подписки',
      });
    }
    
    if (subscriptionType === SubscriptionType.FREE) {
      return res.status(400).json({
        success: false,
        message: 'Нельзя создать платежную сессию для бесплатной подписки',
      });
    }
    
    if (!successUrl || !cancelUrl) {
      return res.status(400).json({
        success: false,
        message: 'URL-адреса успеха и отмены обязательны',
      });
    }
    
    // Get user email and check for existing subscription
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
    }
    
    // ВАЖНО: Не отменяем существующие подписки на этом этапе
    // Это должно произойти только после успешной оплаты новой подписки
    // в обработчике webhook-события checkout.session.completed
    
    // Create Checkout session
    const sessionUrl = await StripeService.createCheckoutSession(
      userId,
      user.email,
      subscriptionType as SubscriptionType,
      successUrl,
      cancelUrl,
    );
    
    return res.status(200).json({
      success: true,
      data: {
        url: sessionUrl,
      },
    });
  } catch (error: unknown) {
    console.error('Error creating checkout session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при создании платежной сессии';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    console.log('🔔 Webhook received at:', new Date().toISOString());
    console.log('Headers:', JSON.stringify({
      'content-type': req.headers['content-type'],
      'stripe-signature': req.headers['stripe-signature'] ? 'present' : 'missing'
    }));
    
    const signature = req.headers['stripe-signature'] as string;
    
    if (!signature) {
      console.error('❌ Webhook error: Missing Stripe signature');
      return res.status(400).json({
        success: false,
        message: 'Stripe signature required',
      });
    }
    
    // The body is already a Buffer in Express raw middleware
    const rawBody = req.body;
    
    if (!Buffer.isBuffer(rawBody)) {
      console.error('❌ Webhook error: Payload is not a Buffer:', typeof rawBody);
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload format. Raw Buffer required.',
      });
    }
    
    console.log(`📦 Webhook body received: ${rawBody.length} bytes`);
    
    // Process the webhook
    const result = await StripeService.handleWebhookEvent(signature, rawBody);
    
    if (result.success) {
      console.log('✅ Webhook processed successfully');
      return res.status(200).json({ received: true });
    } else {
      console.error('❌ Webhook processing failed:', result.message);
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error: unknown) {
    console.error('❌ Error handling webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при обработке вебхука';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const createPortalSession = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { returnUrl } = req.body;
    
    if (!returnUrl) {
      return res.status(400).json({
        success: false,
        message: 'URL возврата обязателен',
      });
    }
    
    // Get user email
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
    }
    
    try {
      // Create Customer Portal session
      const portalUrl = await StripeService.createCustomerPortalSession(
        userId,
        user.email,
        returnUrl,
      );
      
      return res.status(200).json({
        success: true,
        data: {
          url: portalUrl,
        },
      });
    } catch (portalError: any) {
      // Проверка конкретной ошибки конфигурации Customer Portal
      if (portalError.message && 
          (portalError.message.includes('Customer Portal not configured') || 
           portalError.message.includes('configuration has not been created'))) {
        console.error('Customer Portal configuration error:', portalError);
        
        return res.status(503).json({
          success: false,
          message: 'Портал для управления подпиской не настроен в Stripe. Пожалуйста, свяжитесь с администратором сайта.',
          details: 'Требуется настройка Customer Portal в Stripe Dashboard',
        });
      }
      
      // Другие ошибки Stripe API
      throw portalError;
    }
  } catch (error: unknown) {
    console.error('Error creating portal session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при создании портала управления подпиской';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const cancelSubscription = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    
    // Get user subscription
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    const paymentId = user.subscription?.paymentId;
    const userEmail = user.email;
    const currentSubscriptionType = user.subscription?.type;
    
    console.log(`[CancelSub] Processing cancellation for user ${userId} with subscription ${currentSubscriptionType} and paymentId ${paymentId || 'none'}`);
    
    // Check if there's an active subscription to cancel
    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: 'User has no active subscription',
      });
    }
    
    // Check if already scheduled for downgrade
    if (user.subscription?.downgradeOnExpiry) {
      console.log(`[CancelSub] User ${userId} is already scheduled for downgrade at ${user.subscription.endDate}`);
      return res.status(200).json({
        success: true,
        message: 'Your subscription is already scheduled for cancellation',
        data: {
          endDate: user.subscription.endDate
        }
      });
    }
    
    let cancelled = false;
    let subscriptionEndDate = null;
    
    // Check for test subscription ID (for development)
    // if (paymentId.startsWith('test_')) {
    //   console.log('[CancelSub] Test subscription detected, skipping Stripe API call');
    //   cancelled = true;
      
    //   // Create end date - one month from current date
    //   subscriptionEndDate = new Date();
    //   subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
    // } else {
      // Get subscription details from Stripe to find out the end date
      console.log(`[CancelSub] Getting subscription details from Stripe for: ${paymentId}`);
      const subscriptionDetails = await StripeService.getSubscriptionDetails(paymentId);
      
      if (subscriptionDetails) {
        console.log(`[CancelSub] Stripe subscription ${paymentId} status: ${subscriptionDetails.status}`);
        
        // If already canceled in Stripe, just update our DB
        if (subscriptionDetails.status === 'canceled') {
          console.log(`[CancelSub] Subscription ${paymentId} is already canceled in Stripe`);
          cancelled = true;
        } else {
          // Save the current period end date
          subscriptionEndDate = new Date((subscriptionDetails as any).current_period_end * 1000);
          console.log(`[CancelSub] Current subscription period ends: ${subscriptionEndDate.toISOString()}`);
          
          // Set cancelAtPeriodEnd to true to cancel at the end of the billing period
          console.log(`[CancelSub] Setting subscription ${paymentId} to cancel at period end in Stripe`);
          cancelled = await StripeService.cancelSubscription(paymentId, true);
          
          if (cancelled) {
            console.log(`[CancelSub] Successfully set subscription ${paymentId} to cancel at period end in Stripe`);
          } else {
            console.error(`[CancelSub] Failed to set subscription ${paymentId} to cancel at period end in Stripe`);
          }
        }
        
        // Additionally, perform a radical cleanup to catch any lingering subscriptions
        if (userEmail) {
          console.log(`[CancelSub] Performing radical cleanup of all subscriptions for email: ${userEmail}`);
          const cancelledCount = await StripeService.cancelAllSubscriptionsForEmail(userEmail, paymentId); // Exclude current subscription
          if (cancelledCount > 0) {
            console.log(`[CancelSub] Cancelled ${cancelledCount} additional subscriptions for email: ${userEmail}`);
          }
        }
      } else {
        // If subscription details can't be retrieved, cancel it anyway and set
        // end date 30 days in the future for safety
        console.log(`[CancelSub] Couldn't get details for subscription ${paymentId}, attempting to cancel anyway`);
        cancelled = await StripeService.cancelSubscription(paymentId, true);
        
        // Perform radical cleanup here too
        if (userEmail) {
          console.log(`[CancelSub] Performing radical cleanup of all subscriptions for email: ${userEmail}`);
          const cancelledCount = await StripeService.cancelAllSubscriptionsForEmail(userEmail, paymentId); // Exclude current subscription
          if (cancelledCount > 0) {
            console.log(`[CancelSub] Cancelled ${cancelledCount} additional subscriptions for email: ${userEmail}`);
          }
        }
        
        subscriptionEndDate = new Date();
        subscriptionEndDate.setDate(subscriptionEndDate.getDate() + 30);
        console.log(`[CancelSub] Failed to get subscription details, setting end date 30 days from now: ${subscriptionEndDate.toISOString()}`);
      }
    // }
    
    if (cancelled) {
      // In our system, we keep the current subscription type until the end date,
      // but mark it for downgrade after that date
      console.log(`[CancelSub] Updating user ${userId} to downgrade on: ${subscriptionEndDate?.toISOString()}`);
      await User.findByIdAndUpdate(userId, {
        'subscription.isActive': true,
        'subscription.endDate': subscriptionEndDate,
        'subscription.downgradeOnExpiry': true
      });
      
      // Get updated subscription info to return to client
      const updatedUser = await User.findById(userId);
      
      return res.status(200).json({
        success: true,
        message: 'Subscription cancelled. Your privileges will remain until the end of the current period',
        data: {
          endDate: subscriptionEndDate,
          subscriptionType: updatedUser?.subscription?.type || currentSubscriptionType,
          isActive: updatedUser?.subscription?.isActive || true,
          downgradeOnExpiry: true
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to cancel subscription in Stripe',
      });
    }
  } catch (error) {
    console.error('[CancelSub] Error in cancelSubscription:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while cancelling subscription',
    });
  }
};

export const purchaseTokens = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { tokenAmount, price, successUrl, cancelUrl } = req.body;
    
    if (!tokenAmount || !price) {
      return res.status(400).json({
        success: false,
        message: 'Token amount and price are required',
      });
    }
    
    if (!successUrl || !cancelUrl) {
      return res.status(400).json({
        success: false,
        message: 'Success and cancel URLs are required',
      });
    }
    
    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    // Create Checkout session for token purchase
    const sessionUrl = await StripeService.createTokenPurchaseSession(
      userId,
      user.email,
      tokenAmount,
      price,
      successUrl,
      cancelUrl,
    );
    
    return res.status(200).json({
      success: true,
      data: {
        url: sessionUrl,
      },
    });
  } catch (error: unknown) {
    console.error('Error creating token purchase session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error creating token purchase session';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
}; 