import mongoose from 'mongoose';
import User from '../models/user.model';

// Define the SubscriptionType enum directly
enum SubscriptionType {
  FREE = 'free',
  BASIC = 'basic',
  BUSINESS = 'business'
}

// Define the interface for IUser to match model properties
interface IUser {
  aiCredits: number;
  totalCreditsUsed: number;
  creditsResetDate?: Date;
  subscription: {
    type: SubscriptionType;
    startDate: Date;
    endDate: Date | null;
    isActive: boolean;
    paymentId?: string;
    downgradeOnExpiry?: boolean;
  };
}

// Константы для максимального количества кредитов по типу подписки
const SUBSCRIPTION_CREDITS = {
  [SubscriptionType.FREE]: 10,
  [SubscriptionType.BASIC]: 100,
  [SubscriptionType.BUSINESS]: 400
};

// Константы для максимального количества каналов по типу подписки
export const SUBSCRIPTION_CHANNEL_LIMITS = {
  [SubscriptionType.FREE]: 2,
  [SubscriptionType.BASIC]: 10,
  [SubscriptionType.BUSINESS]: Infinity // Неограниченное количество
};

// Стоимость различных AI-операций в кредитах
export const AI_OPERATION_COSTS = {
  TEXT_GENERATION_GPT35: 1,    // Простая генерация текста (GPT-3.5)
  TEXT_GENERATION_GPT4: 5,     // Продвинутая генерация текста (GPT-4)
  IMAGE_GENERATION_BASIC: 3,   // Базовая генерация изображения
  IMAGE_GENERATION_HD: 7       // HD генерация изображения
};

export class CreditService {
  /**
   * Проверяет, достаточно ли у пользователя кредитов для операции
   */
  public static async hasEnoughCredits(userId: string, operationCost: number): Promise<boolean> {
    const user = await User.findById(userId) as unknown as IUser;
    
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    
    return user.aiCredits >= operationCost;
  }
  
  /**
   * Использует кредиты пользователя для AI-операции
   */
  public static async useCredits(userId: string, operationCost: number): Promise<number> {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const user = await User.findById(userId).session(session) as unknown as IUser;
      
      if (!user) {
        throw new Error('Пользователь не найден');
      }
      
      if (user.aiCredits < operationCost) {
        throw new Error('Not enough credits');
      }
      
      user.aiCredits -= operationCost;
      user.totalCreditsUsed += operationCost;
      
      await (user as any).save();
      await session.commitTransaction();
      
      return user.aiCredits;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Добавляет кредиты пользователю
   */
  public static async addCredits(userId: string, credits: number): Promise<number> {
    const user = await User.findById(userId) as unknown as IUser;
    
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    
    user.aiCredits += credits;
    await (user as any).save();
    
    return user.aiCredits;
  }
  
  /**
   * Обновляет подписку пользователя и обрабатывает кредиты
   * При обновлении подписки, существующие кредиты сохраняются и добавляются к новым
   */
  public static async updateSubscription(
    userId: string, 
    subscriptionType: SubscriptionType, 
    paymentId?: string
  ): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const user = await User.findById(userId).session(session) as unknown as IUser;
      
      if (!user) {
        throw new Error('Пользователь не найден');
      }
      
      const currentSubscription = user.subscription?.type;
      const currentCredits = user.aiCredits || 0;
      const oldPaymentId = user.subscription?.paymentId;
      
      console.log(`[UpdateSubscription] Updating subscription for user ${userId}`);
      console.log(`[UpdateSubscription] Current subscription: ${currentSubscription}, New subscription: ${subscriptionType}`);
      console.log(`[UpdateSubscription] Current credits: ${currentCredits}`);
      console.log(`[UpdateSubscription] Old payment ID: ${oldPaymentId || 'none'}, New payment ID: ${paymentId || 'none'}`);
      
      const isSameSubscription = currentSubscription === subscriptionType;
      const isSamePaymentId = oldPaymentId === paymentId;
      const isAutoRenewal = isSameSubscription && isSamePaymentId && paymentId && !paymentId.startsWith('test_');
      
      if (isAutoRenewal) {
        console.log(`[UpdateSubscription] Detected AUTOMATIC RENEWAL of subscription for user ${userId}`);
      } else if (isSameSubscription) {
        console.log(`[UpdateSubscription] User is resubscribing to the same plan type: ${subscriptionType}`);
      } else {
        console.log(`[UpdateSubscription] User is changing subscription from ${currentSubscription} to ${subscriptionType}`);
      }
      
      // If the user is upgrading and already has a different payment ID in Stripe,
      // we should ensure the old subscription is cancelled (done in controller)
      if (oldPaymentId && oldPaymentId !== paymentId && paymentId) {
        console.log(`[UpdateSubscription] User ${userId} changing subscription payment from ${oldPaymentId} to ${paymentId}`);
      }
      
      // Создаем новую дату окончания подписки (месяц)
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      
      // Обновляем данные о подписке
      user.subscription = {
        type: subscriptionType,
        startDate: new Date(),
        endDate: endDate,
        isActive: true,
        paymentId,
        downgradeOnExpiry: false
      };
      
      // Обрабатываем кредиты
      if (subscriptionType === SubscriptionType.FREE) {
        // При переходе на бесплатный план - просто устанавливаем максимум для FREE
        console.log(`[UpdateSubscription] Setting credits to FREE tier amount: ${SUBSCRIPTION_CREDITS[SubscriptionType.FREE]}`);
        user.aiCredits = SUBSCRIPTION_CREDITS[SubscriptionType.FREE];
      } else {
        // При переходе на платный план или обновлении платного плана
        if (currentSubscription === subscriptionType) {
          // Если тип подписки не изменился, просто добавляем кредиты подписки
          const newCreditsToAdd = SUBSCRIPTION_CREDITS[subscriptionType];
          const newTotalCredits = user.aiCredits + newCreditsToAdd;
          
          console.log(`[UpdateSubscription] Adding ${newCreditsToAdd} credits to existing ${user.aiCredits} credits = ${newTotalCredits}`);
          user.aiCredits = newTotalCredits;
        } else {
          // Если тип подписки изменился, сохраняем текущие кредиты и добавляем новые
          const newCreditsAmount = SUBSCRIPTION_CREDITS[subscriptionType];
          user.aiCredits = currentCredits + newCreditsAmount;
          
          console.log(`[UpdateSubscription] Subscription changed: ${currentSubscription} -> ${subscriptionType}. Credits: ${currentCredits} + ${newCreditsAmount} = ${user.aiCredits}`);
        }
      }
      
      // Устанавливаем дату сброса кредитов
      user.creditsResetDate = endDate;
      
      await (user as any).save();
      await session.commitTransaction();
      
      console.log(`[UpdateSubscription] Successfully updated subscription for user ${userId}. New type: ${subscriptionType}, New credits: ${user.aiCredits}`);
    } catch (error) {
      await session.abortTransaction();
      console.error('[UpdateSubscription] Error updating subscription:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Сбрасывает кредиты пользователей, у которых истек период подписки
   * и переводит на бесплатный план пользователей с отметкой о понижении подписки
   * Эта функция должна запускаться по расписанию, например, каждые 6 часов
   */
  public static async resetExpiredCredits(): Promise<number> {
    const now = new Date();
    let totalProcessed = 0;
    
    console.log(`[Scheduler] Running subscription checks at ${now.toISOString()}`);
    
    // 1. Find users marked for downgrade whose subscription will expire in the next 3 days
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    
    const usersToDowngradeEarly = await User.find({
      'subscription.downgradeOnExpiry': true,
      'subscription.isActive': true,
      'subscription.endDate': { $lte: threeDaysFromNow, $gt: now }
    });
    
    console.log(`[Scheduler] Found ${usersToDowngradeEarly.length} users for early downgrade to FREE (before Stripe renewal)`);
    
    // Process each user for early downgrade
    for (const user of usersToDowngradeEarly) {
      try {
        console.log(`[Scheduler] Processing early downgrade for user ${user._id}, current subscription: ${user.subscription.type}, paymentId: ${user.subscription.paymentId || 'none'}`);
        
        // If the user has a paymentId, cancel the subscription in Stripe immediately
        if (user.subscription.paymentId && !user.subscription.paymentId.startsWith('test_')) {
          console.log(`[Scheduler] Cancelling subscription ${user.subscription.paymentId} for user ${user._id} in Stripe before automatic renewal`);
          
          try {
            // Dynamic import to avoid circular dependency
            const stripeModule = await import('../services/stripe.service');
            const StripeService = stripeModule.default;
            
            // Cancel subscription immediately to prevent new charges
            const cancelled = await StripeService.cancelSubscription(user.subscription.paymentId, false);
            console.log(`[Scheduler] Stripe cancellation result for ${user.subscription.paymentId}: ${cancelled ? 'Success' : 'Failed'}`);
            
            // Verify subscription status in Stripe
            try {
              const subscriptionDetails = await StripeService.getSubscriptionDetails(user.subscription.paymentId);
              if (subscriptionDetails) {
                console.log(`[Scheduler] Current Stripe status for subscription ${user.subscription.paymentId}: ${subscriptionDetails.status}`);
              } else {
                console.log(`[Scheduler] Couldn't retrieve subscription details from Stripe, possibly already deleted`);
              }
            } catch (verifyError) {
              console.error(`[Scheduler] Error verifying subscription status: ${verifyError}`);
            }
          } catch (stripeError) {
            console.error(`[Scheduler] Error cancelling subscription in Stripe: ${stripeError}`);
          }
        }
        
        // Preserve current credits when downgrading to FREE
        const currentCredits = user.aiCredits;
        const oldSubscriptionType = user.subscription.type;
        
        // Downgrade to FREE but preserve credits
        user.subscription.type = SubscriptionType.FREE.toLowerCase() as SubscriptionType;
        user.subscription.isActive = true;
        user.subscription.downgradeOnExpiry = false;
        
        // Set new credits reset date (one month from now)
        const newResetDate = new Date();
        newResetDate.setMonth(newResetDate.getMonth() + 1);
        user.creditsResetDate = newResetDate;
        
        await user.save();
        totalProcessed++;
        
        console.log(`[Scheduler] User ${user._id} downgraded from ${oldSubscriptionType} to FREE plan before charge. Preserved ${currentCredits} credits.`);
      } catch (error) {
        console.error(`[Scheduler] Error during early downgrade for user ${user._id}: ${error}`);
      }
    }
    
    // 2. Find users with expired subscriptions that are marked for downgrade
    const usersToDowngrade = await User.find({
      'subscription.endDate': { $lte: now },
      'subscription.isActive': true,
      'subscription.downgradeOnExpiry': true
    });
    
    console.log(`[Scheduler] Found ${usersToDowngrade.length} users with expired subscriptions for downgrade to FREE`);
    
    // Process each user with expired subscription
    for (const user of usersToDowngrade) {
      try {
        console.log(`[Scheduler] Processing downgrade for user ${user._id}, current subscription: ${user.subscription.type}, paymentId: ${user.subscription.paymentId || 'none'}`);
        
        // Double-check Stripe subscription status
        if (user.subscription.paymentId && !user.subscription.paymentId.startsWith('test_')) {
          try {
            // Dynamic import to avoid circular dependency
            const stripeModule = await import('../services/stripe.service');
            const StripeService = stripeModule.default;
            
            // Verify the subscription is actually cancelled in Stripe
            const subscriptionDetails = await StripeService.getSubscriptionDetails(user.subscription.paymentId);
            if (subscriptionDetails && subscriptionDetails.status !== 'canceled') {
              console.log(`[Scheduler] Subscription ${user.subscription.paymentId} is still ${subscriptionDetails.status} in Stripe. Attempting to cancel.`);
              await StripeService.cancelSubscription(user.subscription.paymentId, false);
            }
          } catch (stripeError) {
            console.error(`[Scheduler] Error verifying/cancelling Stripe subscription: ${stripeError}`);
          }
        }
        
        // Preserve current credits when downgrading
        const currentCredits = user.aiCredits;
        const oldSubscriptionType = user.subscription.type;
        
        // Downgrade to FREE but preserve credits
        user.subscription.type = SubscriptionType.FREE.toLowerCase() as SubscriptionType;
        user.subscription.isActive = true;
        user.subscription.downgradeOnExpiry = false;
        
        // Set new credits reset date (one month from now)
        const newResetDate = new Date();
        newResetDate.setMonth(newResetDate.getMonth() + 1);
        user.creditsResetDate = newResetDate;
        
        await user.save();
        totalProcessed++;
        
        console.log(`[Scheduler] User ${user._id} downgraded from ${oldSubscriptionType} to FREE plan. Preserved ${currentCredits} credits.`);
      } catch (error) {
        console.error(`[Scheduler] Error downgrading user ${user._id}: ${error}`);
      }
    }
    
    // 3. Reset credits for users with expired reset dates
    // but not marked for downgrade (normal subscription expiry)
    const resetResult = await User.updateMany(
      { 
        creditsResetDate: { $lte: now },
        'subscription.isActive': true,
        'subscription.downgradeOnExpiry': { $ne: true }  
      },
      { 
        $set: { 
          aiCredits: 0,
          'subscription.isActive': false 
        } 
      }
    );
    
    totalProcessed += resetResult.modifiedCount;
    console.log(`[Scheduler] Reset credits for ${resetResult.modifiedCount} users without downgrade mark`);
    
    console.log(`[Scheduler] Finished processing ${totalProcessed} subscriptions`);
    return totalProcessed;
  }
  
  /**
   * Получает информацию о кредитах пользователя
   */
  public static async getCreditInfo(userId: string) {
    const user = await User.findById(userId) as unknown as IUser;
    
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    
    // Ensure subscription type is in lowercase
    const subscriptionType = (user.subscription.type || '').toLowerCase() as SubscriptionType;
    
    return {
      currentCredits: user.aiCredits,
      totalUsed: user.totalCreditsUsed,
      maxCredits: SUBSCRIPTION_CREDITS[subscriptionType] || SUBSCRIPTION_CREDITS[SubscriptionType.FREE],
      subscriptionType: subscriptionType,
      resetDate: user.creditsResetDate,
      isActive: user.subscription.isActive,
      downgradeOnExpiry: user.subscription.downgradeOnExpiry || false,
      endDate: user.subscription.endDate
    };
  }

  /**
   * Проверяет, не превышен ли лимит каналов для данного типа подписки
   */
  public static async canAddChannel(userId: string): Promise<{allowed: boolean, limit: number, current: number}> {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    
    const subscriptionType = (user.subscription?.type || SubscriptionType.FREE).toLowerCase() as SubscriptionType;
    const channelLimit = SUBSCRIPTION_CHANNEL_LIMITS[subscriptionType] || SUBSCRIPTION_CHANNEL_LIMITS[SubscriptionType.FREE];
    const currentChannelsCount = user.channels?.length || 0;
    
    return {
      allowed: currentChannelsCount < channelLimit,
      limit: channelLimit === Infinity ? -1 : channelLimit, // -1 for frontend to show "unlimited"
      current: currentChannelsCount
    };
  }
}

export default CreditService; 