import Stripe from 'stripe';
import config from '../config/config';
import { SubscriptionType } from '../models/user.model';
import CreditService from './credit.service';
import mongoose from 'mongoose';

// Initialize Stripe with API key based on environment
const stripe = new Stripe(config.stripe.secretKey);

// Define price IDs for different subscription plans
// We'll create prices dynamically if they don't exist
const SUBSCRIPTION_PRICE_IDS: Record<string, string> = {};

// Mapping between Stripe products and our subscription types
// Using the same product for all subscription types for $1 pricing
const PRODUCT_TO_SUBSCRIPTION_TYPE: Record<string, SubscriptionType> = {};

export class StripeService {
  /**
   * Create a Stripe Checkout session for subscription
   */
  public static async createCheckoutSession(
    userId: string,
    userEmail: string,
    subscriptionType: SubscriptionType,
    successUrl: string,
    cancelUrl: string,
  ): Promise<string> {
    if (subscriptionType === SubscriptionType.FREE) {
      throw new Error('Cannot create checkout session for free subscription');
    }

    try {
      // Create a product for the subscription type if it doesn't exist
      let productId = '';
      const productName = subscriptionType === SubscriptionType.BASIC 
        ? 'Basic Plan' 
        : subscriptionType === SubscriptionType.BUSINESS 
          ? 'Business Plan' 
          : 'Business Plan';
        
      // Get or create product
      let products = await stripe.products.list({
        active: true,
        limit: 100
      });
      
      let product = products.data.find(p => p.name === productName);
      
      if (!product) {
        product = await stripe.products.create({
          name: productName,
          description: `${productName} subscription for Telepublisher`,
        });
      }
      
      productId = product.id;
      PRODUCT_TO_SUBSCRIPTION_TYPE[productId] = subscriptionType;
      
      // Get or create price (always $1)
      let price;
      const prices = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 100
      });
      
      if (prices.data.length > 0) {
        price = prices.data[0];
      } else {
        price = await stripe.prices.create({
          product: productId,
          unit_amount: 100, // $1.00
          currency: 'usd',
          recurring: {
            interval: 'month',
          },
        });
      }
      
      SUBSCRIPTION_PRICE_IDS[subscriptionType] = price.id;
      
      // Create a Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        customer_email: userEmail,
        metadata: {
          userId,
          subscriptionType,
        },
      });

      return session.url || '';
    } catch (error) {
      console.error('Error in createCheckoutSession:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   */
  public static async handleWebhookEvent(
    signature: string,
    rawBody: Buffer,
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Handling webhook with signature:', signature.substring(0, 20) + '...');
      console.log('Webhook body type:', typeof rawBody);
      console.log('Is Buffer:', Buffer.isBuffer(rawBody));
      console.log('Buffer length:', rawBody.length);
      
      // Verify webhook signature
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        config.stripe.webhookSecret,
      );
      
      console.log(`Processing webhook event: ${event.type}`, 'id:', event.id);
      
      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const { userId, subscriptionType, tokenAmount, type } = session.metadata || {};
          
          // Handle token purchase
          if (userId && tokenAmount && type === 'token_purchase') {
            console.log(`Webhook checkout.session.completed: token purchase for user ${userId}, amount: ${tokenAmount}`);
            
            try {
              // Add tokens to user's account
              const tokens = parseInt(tokenAmount, 10);
              await CreditService.addCredits(userId, tokens);
              
              return {
                success: true,
                message: `${tokens} AI tokens added for user ${userId}`,
              };
            } catch (error) {
              console.error(`Error adding tokens for user ${userId}:`, error);
              return {
                success: false,
                message: `Error adding tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
              };
            }
          }
          
          // Handle subscription
          if (userId && subscriptionType) {
            console.log(`Webhook checkout.session.completed: создание подписки для пользователя ${userId} с типом ${subscriptionType}`);
            
            // Если сессия содержит подписку, обрабатываем её
            const subscriptionId = session.subscription as string;
            
            if (subscriptionId) {
              console.log(`Webhook checkout.session.completed: получена новая подписка ${subscriptionId}`);
              
              try {
                // Получаем подписку и клиента из Stripe
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const customerId = subscription.customer as string;
                
                if (customerId) {
                  // Получаем информацию о клиенте для получения email
                  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
                  const email = customer.email;
                  
                  if (email) {
                    console.log(`Webhook checkout.session.completed: радикальная очистка подписок для email ${email}`);
                    
                    // Радикальная очистка - отменяем все подписки по email, кроме новой
                    const cancelledCount = await StripeService.cancelAllSubscriptionsForEmail(email, subscriptionId);
                    
                    if (cancelledCount > 0) {
                      console.log(`Webhook checkout.session.completed: отменено ${cancelledCount} старых подписок для email ${email}`);
                    } else {
                      console.log(`Webhook checkout.session.completed: дополнительных подписок для отмены не найдено для email ${email}`);
                    }
                  }
                }
              } catch (stripeError) {
                console.error(`Webhook checkout.session.completed: ошибка при отмене старых подписок:`, stripeError);
                // Продолжаем несмотря на ошибку
              }
            }
            
            // Обновляем подписку в нашей базе данных
            await CreditService.updateSubscription(
              userId,
              subscriptionType as SubscriptionType,
              subscriptionId,
            );

            return {
              success: true,
              message: `Subscription ${subscriptionType} activated for user ${userId}`,
            };
          }
          break;
        }

        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          // Get the subscription ID from the invoice lines data
          let subscriptionId: string | null = null;
          
          if (invoice.lines && invoice.lines.data.length > 0) {
            // Try to get subscription ID from the first line item
            const firstLineItem = invoice.lines.data[0];
            if ('subscription' in firstLineItem && firstLineItem.subscription) {
              subscriptionId = firstLineItem.subscription as string;
            }
          }
          
          if (!subscriptionId) {
            return {
              success: false,
              message: 'Could not find subscription ID in invoice',
            };
          }
          
          console.log(`Webhook invoice.paid: обработка оплаты для подписки ${subscriptionId}`);
          
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const productId = subscription.items.data[0]?.price.product as string;
            const customerId = invoice.customer as string;
            
            // Get customer's metadata to find our userId
            const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
            const userId = customer.metadata.userId;
            const email = customer.email;
            
            if (!userId) {
              console.warn(`Webhook invoice.paid: не найден userId для клиента ${customerId}`);
              return {
                success: false,
                message: 'Customer metadata does not contain userId',
              };
            }
            
            // Determine subscription type from product
            let subscriptionType = SubscriptionType.FREE;
            
            // Look up products to determine subscription type
            if (productId) {
              try {
                const product = await stripe.products.retrieve(productId);
                
                if (product.name.includes('Basic')) {
                  subscriptionType = SubscriptionType.BASIC;
                } else if (product.name.includes('Business')) {
                  subscriptionType = SubscriptionType.BUSINESS;
                }
              } catch (error) {
                console.error('Ошибка при получении продукта:', error);
              }
            }
            
            // Радикальная очистка подписок по email
            if (email) {
              console.log(`Webhook invoice.paid: радикальная очистка подписок для email ${email}`);
              const cancelledCount = await StripeService.cancelAllSubscriptionsForEmail(email, subscriptionId);
              
              if (cancelledCount > 0) {
                console.log(`Webhook invoice.paid: отменено ${cancelledCount} дублирующихся подписок для email ${email}`);
              } else {
                console.log(`Webhook invoice.paid: дублирующихся подписок не найдено для email ${email}`);
              }
            } else {
              console.log(`Webhook invoice.paid: у клиента ${customerId} не указан email, чистка по email невозможна`);
              
              // В качестве запасного варианта, очищаем по customerId
              console.log(`Webhook invoice.paid: очистка подписок для клиента ${customerId}`);
              const cancelledCount = await StripeService.cancelAllCustomerSubscriptions(customerId, subscriptionId);
              
              if (cancelledCount > 0) {
                console.log(`Webhook invoice.paid: отменено ${cancelledCount} дублирующихся подписок для клиента ${customerId}`);
              }
            }
            
            // Обновляем подписку в нашей БД
            await CreditService.updateSubscription(
              userId,
              subscriptionType,
              subscription.id,
            );
            
            return {
              success: true,
              message: `Subscription renewed for user ${userId}`,
            };
          } catch (error) {
            console.error('Ошибка при обработке webhook invoice.paid:', error);
            return {
              success: false,
              message: `Error processing invoice.paid: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
          }
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          
          // Get customer's metadata to find our userId
          const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
          const userId = customer.metadata.userId;
          
          if (userId) {
            // Check if the user is already marked for downgrade at period end
            const user = await mongoose.model('User').findById(userId);
            
            // Only take action if the user isn't already marked for downgrade
            if (!user?.subscription?.downgradeOnExpiry) {
              // Downgrade to free plan when subscription is cancelled immediately
              await CreditService.updateSubscription(
                userId,
                SubscriptionType.FREE,
              );
            }

            return {
              success: true,
              message: `Subscription cancelled for user ${userId}`,
            };
          }
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          
          console.log('Received customer.subscription.updated event:', subscription.id);
          console.log('cancel_at_period_end:', subscription.cancel_at_period_end);
          
          // Get previous attributes if available
          const previousAttributes = (event.data.previous_attributes as any) || {};
          console.log('Previous attributes:', JSON.stringify(previousAttributes));
          
          // Check if cancel_at_period_end was changed (from true to false - subscription renewal)
          const cancelStatusChanged = 'cancel_at_period_end' in previousAttributes;
          const wasMarkedForCancellation = cancelStatusChanged && previousAttributes.cancel_at_period_end === true;
          const nowNotMarkedForCancellation = subscription.cancel_at_period_end === false;
          
          // Case 1: Subscription being marked for cancellation at period end
          if (subscription.cancel_at_period_end) {
            const customerId = subscription.customer as string;
            console.log('Customer ID:', customerId);
            
            // Get customer's metadata to find our userId
            const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
            console.log('Customer metadata:', customer.metadata);
            const userEmail = customer.email;
            console.log('Customer email:', userEmail);
            
            // First try to get userId from metadata
            let userId = customer.metadata.userId;
            console.log('User ID from metadata:', userId);
            
            // If there's no userId in metadata but we have an email, try to find user by email
            if (!userId && userEmail) {
              console.log(`No userId in customer metadata, trying to find user by email: ${userEmail}`);
              const userModel = mongoose.model('User');
              
              try {
                // Find user by email
                const userByEmail = await userModel.findOne({ email: userEmail });
                
                if (userByEmail) {
                  userId = userByEmail._id.toString();
                  console.log(`Found user by email: ${userId}`);
                  
                  // Update Stripe customer metadata with userId for future webhooks
                  console.log(`Updating Stripe customer metadata with found userId: ${userId}`);
                  await stripe.customers.update(customerId, {
                    metadata: {
                      ...customer.metadata,
                      userId: userId
                    }
                  });
                } else {
                  console.log(`No user found with email: ${userEmail}`);
                }
              } catch (findError) {
                console.error('Error finding user by email:', findError);
              }
            }
            
            if (userId) {
              // Get current user
              const user = await mongoose.model('User').findById(userId);
              console.log('User found:', !!user);
              console.log('Current downgradeOnExpiry setting:', user?.subscription?.downgradeOnExpiry);
              
              // Only update if the user exists and isn't already marked for downgrade
              if (user && !user.subscription?.downgradeOnExpiry) {
                console.log(`Webhook: Marking subscription for user ${userId} to downgrade at period end`);
                
                // Calculate the end date of the subscription period
                const endDate = new Date((subscription as any).current_period_end * 1000);
                console.log('Subscription end date:', endDate);
                
                // Mark the subscription for downgrade
                await mongoose.model('User').findByIdAndUpdate(userId, {
                  'subscription.endDate': endDate,
                  'subscription.downgradeOnExpiry': true
                });
                
                console.log('User updated with downgradeOnExpiry = true');
                
                return {
                  success: true,
                  message: `Subscription marked for cancellation for user ${userId}`,
                };
              } else {
                console.log('User not updated: either not found or already marked for downgrade');
              }
            } else {
              console.log('No userId found in customer metadata and could not find by email');
            }
          } 
          // Case 2: Subscription was marked for cancellation but now is not (renewal)
          else if (wasMarkedForCancellation && nowNotMarkedForCancellation) {
            console.log('Subscription was renewed (cancellation was undone)');
            
            const customerId = subscription.customer as string;
            console.log('Customer ID:', customerId);
            
            // Get customer's metadata to find our userId
            const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
            console.log('Customer metadata:', customer.metadata);
            const userEmail = customer.email;
            console.log('Customer email:', userEmail);
            
            // First try to get userId from metadata
            let userId = customer.metadata.userId;
            console.log('User ID from metadata:', userId);
            
            // If there's no userId in metadata but we have an email, try to find user by email
            if (!userId && userEmail) {
              console.log(`No userId in customer metadata, trying to find user by email: ${userEmail}`);
              const userModel = mongoose.model('User');
              
              try {
                // Find user by email
                const userByEmail = await userModel.findOne({ email: userEmail });
                
                if (userByEmail) {
                  userId = userByEmail._id.toString();
                  console.log(`Found user by email: ${userId}`);
                  
                  // Update Stripe customer metadata with userId for future webhooks
                  console.log(`Updating Stripe customer metadata with found userId: ${userId}`);
                  await stripe.customers.update(customerId, {
                    metadata: {
                      ...customer.metadata,
                      userId: userId
                    }
                  });
                } else {
                  console.log(`No user found with email: ${userEmail}`);
                }
              } catch (findError) {
                console.error('Error finding user by email:', findError);
              }
            }
            
            if (userId) {
              // Get current user
              const user = await mongoose.model('User').findById(userId);
              console.log('User found:', !!user);
              console.log('Current downgradeOnExpiry setting:', user?.subscription?.downgradeOnExpiry);
              
              // Update if the user exists and is currently marked for downgrade
              if (user && user.subscription?.downgradeOnExpiry) {
                console.log(`Webhook: Marking subscription for user ${userId} as renewed (removing downgradeOnExpiry flag)`);
                
                // Unmark the subscription for downgrade
                await mongoose.model('User').findByIdAndUpdate(userId, {
                  'subscription.downgradeOnExpiry': false
                });
                
                console.log('User updated with downgradeOnExpiry = false');
                
                return {
                  success: true,
                  message: `Subscription renewed for user ${userId}`,
                };
              } else {
                console.log('User not updated: either not found or not marked for downgrade');
              }
            } else {
              console.log('No userId found in customer metadata and could not find by email');
            }
          } else {
            console.log('Subscription update does not involve cancellation status change');
          }
          break;
        }

        default:
          return {
            success: true,
            message: `Unhandled event type: ${event.type}`,
          };
      }

      return {
        success: true,
        message: 'Webhook processed successfully',
      };
    } catch (error) {
      console.error('Error processing webhook:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Error processing webhook: ${errorMessage}`,
      };
    }
  }

  /**
   * Cancel a subscription
   */
  public static async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean = true
  ): Promise<boolean> {
    try {
      // Special handling for test subscriptions
      if (subscriptionId.startsWith('test_')) {
        console.log('Имитация отмены тестовой подписки:', subscriptionId);
        return true;
      }
      
      // For real subscriptions, call Stripe API
      // Always update the subscription to cancel at period end instead of immediate cancellation
      console.log(`Setting subscription ${subscriptionId} to cancel at period end`);
      
      try {
        // Retrieve subscription first to check its current status
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        console.log(`Current subscription status: ${subscription.status}`);
        
        if (subscription.status === 'canceled') {
          console.log(`Subscription ${subscriptionId} is already canceled`);
          return true;
        }
        
        // Always update to cancel at period end, regardless of the cancelAtPeriodEnd parameter
        const updated = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
        
        console.log(`Successfully set subscription ${subscriptionId} to cancel at period end. Status: ${updated.status}`);
        return true;
      } catch (error: any) {
        // Handle specific Stripe errors
        if (error.type === 'StripeInvalidRequestError') {
          if (error.message && error.message.includes('No such subscription')) {
            console.log('Subscription not found in Stripe, treating as already cancelled:', subscriptionId);
            return true;
          }
          // Handle other Stripe errors
          console.error(`Stripe API error when cancelling subscription: ${error.message}`);
          throw error;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      
      // Special handling for "No such subscription" error - consider it already cancelled
      if (error.type === 'StripeInvalidRequestError' && 
          error.message && 
          error.message.includes('No such subscription')) {
        console.log('Subscription not found in Stripe, treating as already cancelled:', subscriptionId);
        return true;
      }
      
      // Log the full error for diagnosis
      console.error('Detailed cancellation error:', JSON.stringify(error, null, 2));
      return false;
    }
  }

  /**
   * Get subscription details
   */
  public static async getSubscriptionDetails(
    subscriptionId: string
  ): Promise<Stripe.Subscription | null> {
    try {
      // Для тестовых подписок возвращаем объект, имитирующий подписку Stripe
      if (subscriptionId.startsWith('test_')) {
        console.log('Возвращаем имитацию подписки для тестового ID', subscriptionId);
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 1);
        
        return {
          id: subscriptionId,
          current_period_end: Math.floor(futureDate.getTime() / 1000),
          // Другие необходимые поля, которые могут быть нужны в приложении
          status: 'active',
          cancel_at_period_end: false, // По умолчанию не отменено
          customer: '',
          items: {
            data: []
          }
        } as any;
      }
      
      // Для реальных подписок обращаемся к API Stripe
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('Error retrieving subscription details:', error);
      return null;
    }
  }

  /**
   * Get customer portal URL for subscription management
   */
  public static async createCustomerPortalSession(
    userId: string,
    userEmail: string,
    returnUrl: string,
  ): Promise<string> {
    try {
      console.log(`[CustomerPortal] Creating portal session for user ${userId} with email ${userEmail}`);
      
      // First find or create customer for this user
      let customerId: string;
      const customers = await stripe.customers.list({
        email: userEmail,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        console.log(`[CustomerPortal] Found existing customer ${customerId} for email ${userEmail}`);
        
        // Check if customer has userId in metadata, if not - update it
        const customerData = customers.data[0];
        if (!customerData.metadata?.userId) {
          console.log(`[CustomerPortal] Updating existing customer ${customerId} with missing userId ${userId} in metadata`);
          
          // Update customer metadata to include userId
          await stripe.customers.update(customerId, {
            metadata: {
              ...customerData.metadata,
              userId: userId
            }
          });
          
          console.log(`[CustomerPortal] Updated customer ${customerId} metadata with userId ${userId}`);
        } else if (customerData.metadata.userId !== userId) {
          console.log(`[CustomerPortal] Warning: Customer ${customerId} has different userId in metadata: ${customerData.metadata.userId} vs ${userId}`);
        }
      } else {
        // Create a new customer
        console.log(`[CustomerPortal] Creating new customer for email ${userEmail}`);
        const newCustomer = await stripe.customers.create({
          email: userEmail,
          metadata: {
            userId,
          },
        });
        customerId = newCustomer.id;
        console.log(`[CustomerPortal] Created new customer ${customerId}`);
      }

      // Create a customer portal session with explicit configuration
      console.log(`[CustomerPortal] Creating portal session for customer ${customerId}`);
      try {
        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl,
        });
        
        console.log(`[CustomerPortal] Successfully created portal session with URL: ${session.url}`);
        return session.url;
      } catch (portalError: any) {
        // If configuration was the issue and we can't provide it inline, 
        // give clear instructions to set up the portal
        if (portalError.type === 'StripeInvalidRequestError' && 
            portalError.message && 
            portalError.message.includes('configuration')) {
          console.error('[CustomerPortal] Portal configuration error:', portalError.message);
          console.error('[CustomerPortal] Please set up Customer Portal at https://dashboard.stripe.com/test/settings/billing/portal');
          throw new Error('Stripe Customer Portal not configured. Please set up Customer Portal in your Stripe dashboard.');
        }
        throw portalError;
      }
    } catch (error) {
      console.error('[CustomerPortal] Error creating portal session:', error);
      throw error;
    }
  }

  /**
   * Cancel all subscriptions for a customer
   * @param customerId ID клиента в Stripe
   * @param exceptSubscriptionId ID подписки, которую нужно сохранить (опционально)
   */
  public static async cancelAllCustomerSubscriptions(
    customerId: string, 
    exceptSubscriptionId?: string
  ): Promise<number> {
    try {
      if (exceptSubscriptionId) {
        console.log(`Отмена всех активных подписок для клиента ${customerId} (кроме ${exceptSubscriptionId})`);
      } else {
        console.log(`Отмена ВСЕХ активных подписок для клиента ${customerId}`);
      }
      
      // Найти все активные подписки для этого клиента
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active'
      });
      
      console.log(`Найдено ${subscriptions.data.length} активных подписок для клиента ${customerId}`);
      
      let cancelledCount = 0;
      
      // Отменить все подписки (кроме исключения, если оно задано)
      for (const subscription of subscriptions.data) {
        if (!exceptSubscriptionId || subscription.id !== exceptSubscriptionId) {
          console.log(`Установка отмены по окончании периода для подписки ${subscription.id} клиента ${customerId}`);
          try {
            // Отменяем подписку на конец текущего периода
            await stripe.subscriptions.update(subscription.id, {
              cancel_at_period_end: true
            });
            cancelledCount++;
          } catch (cancelError) {
            console.error(`Ошибка при отмене подписки ${subscription.id}:`, cancelError);
            // Продолжаем с другими подписками
          }
        } else {
          console.log(`Сохранение активной подписки ${subscription.id} для клиента ${customerId}`);
        }
      }
      
      console.log(`Успешно отменено ${cancelledCount} подписок для клиента ${customerId}`);
      return cancelledCount;
    } catch (error) {
      console.error('Ошибка при отмене подписок клиента:', error);
      return 0;
    }
  }

  /**
   * Find customer by email
   */
  public static async findCustomerByEmail(email: string): Promise<Stripe.Customer[]> {
    try {
      const customers = await stripe.customers.list({
        email: email,
        limit: 10
      });
      
      return customers.data;
    } catch (error) {
      console.error('Error finding customer by email:', error);
      return [];
    }
  }

  /**
   * Найти и отменить все подписки для заданного email пользователя
   * Это более радикальная очистка, которая найдет и отменит все подписки
   * связанные с email, даже если они принадлежат разным клиентам в Stripe
   */
  public static async cancelAllSubscriptionsForEmail(
    email: string,
    exceptSubscriptionId?: string
  ): Promise<number> {
    try {
      console.log(`Радикальная очистка: поиск всех подписок для email ${email}`);
      
      // Найти всех клиентов с этим email
      const customers = await stripe.customers.list({
        email: email,
        limit: 100
      });
      
      if (!customers || customers.data.length === 0) {
        console.log(`Для email ${email} не найдено ни одного клиента в Stripe`);
        return 0;
      }
      
      console.log(`Найдено ${customers.data.length} клиентов в Stripe для email ${email}`);
      
      let totalCancelled = 0;
      
      // Для каждого клиента отменить все его подписки
      for (const customer of customers.data) {
        const customerId = customer.id;
        console.log(`Обрабатываем клиента ${customerId}`);
        
        // Получаем все активные подписки клиента
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active'
        });
        
        console.log(`Найдено ${subscriptions.data.length} активных подписок для клиента ${customerId}`);
        
        // Отменяем все подписки кроме исключения
        for (const subscription of subscriptions.data) {
          if (!exceptSubscriptionId || subscription.id !== exceptSubscriptionId) {
            console.log(`Установка отмены по окончании периода для подписки ${subscription.id} клиента ${customerId}`);
            try {
              // Отменяем подписку на конец текущего периода, а не немедленно
              await stripe.subscriptions.update(subscription.id, {
                cancel_at_period_end: true
              });
              totalCancelled++;
            } catch (cancelError) {
              console.error(`Ошибка при отмене подписки ${subscription.id}:`, cancelError);
              // Продолжаем с другими подписками
            }
          } else {
            console.log(`Сохранение активной подписки ${subscription.id}`);
          }
        }
      }
      
      console.log(`ИТОГО: отменено ${totalCancelled} подписок для email ${email}`);
      return totalCancelled;
    } catch (error) {
      console.error('Ошибка при отмене всех подписок для email:', error);
      return 0;
    }
  }

  /**
   * Create a Stripe Checkout session for token purchase
   */
  public static async createTokenPurchaseSession(
    userId: string,
    userEmail: string,
    tokenAmount: number,
    price: number,
    successUrl: string,
    cancelUrl: string,
  ): Promise<string> {
    try {
      // Create a product for AI tokens if it doesn't exist
      let productName = 'AI Tokens';
      
      // Get or create product
      let products = await stripe.products.list({
        active: true,
        limit: 100
      });
      
      let product = products.data.find(p => p.name === productName);
      
      if (!product) {
        product = await stripe.products.create({
          name: productName,
          description: `AI Tokens for content generation in Telepublisher`,
        });
      }
      
      const productId = product.id;
      
      // Create a one-time price for the token package
      // This is a one-time purchase, not a subscription
      const priceId = await stripe.prices.create({
        product: productId,
        unit_amount: price * 100, // Convert to cents
        currency: 'usd',
      });
      
      // Create a Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId.id,
            quantity: 1,
          },
        ],
        mode: 'payment', // one-time payment
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        customer_email: userEmail,
        metadata: {
          userId,
          tokenAmount: tokenAmount.toString(),
          type: 'token_purchase'
        },
      });

      return session.url || '';
    } catch (error) {
      console.error('Error in createTokenPurchaseSession:', error);
      throw error;
    }
  }
}

export default StripeService;