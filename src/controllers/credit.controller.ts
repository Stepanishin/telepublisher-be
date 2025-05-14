import { Request, Response } from 'express';
import CreditService, { AI_OPERATION_COSTS } from '../services/credit.service';

// Define the SubscriptionType enum directly
enum SubscriptionType {
  FREE = 'free',
  BASIC = 'basic',
  BUSINESS = 'business'
}

// Определение типа для операций с AI
type AIOperationType = keyof typeof AI_OPERATION_COSTS;

export const getCreditInfo = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const creditInfo = await CreditService.getCreditInfo(userId);
    
    return res.status(200).json({
      success: true,
      data: creditInfo
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при получении информации о кредитах';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const useCredits = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { operationType, quantity = 1 } = req.body;
    
    // Проверка, что операция является допустимым типом
    if (!operationType || !(operationType in AI_OPERATION_COSTS)) {
      return res.status(400).json({
        success: false,
        message: 'Неверный тип операции',
      });
    }
    
    const cost = AI_OPERATION_COSTS[operationType as AIOperationType] * quantity;
    
    // Проверка наличия достаточного количества кредитов
    const hasEnough = await CreditService.hasEnoughCredits(userId, cost);
    if (!hasEnough) {
      return res.status(403).json({
        success: false,
        message: 'Not enough credits for the operation',
      });
    }
    
    // Использование кредитов
    const remainingCredits = await CreditService.useCredits(userId, cost);
    
    return res.status(200).json({
      success: true,
      data: {
        remainingCredits,
        cost,
        operationType
      }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при использовании кредитов';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const addCredits = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { credits } = req.body;
    
    if (!credits || isNaN(credits) || credits <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Укажите корректное количество кредитов',
      });
    }
    
    const newCredits = await CreditService.addCredits(userId, parseInt(credits, 10));
    
    return res.status(200).json({
      success: true,
      data: {
        credits: newCredits
      }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при добавлении кредитов';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const updateSubscription = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { subscriptionType, paymentId } = req.body;
    
    if (!subscriptionType || !Object.values(SubscriptionType).includes(subscriptionType)) {
      return res.status(400).json({
        success: false,
        message: 'Укажите корректный тип подписки',
      });
    }
    
    await CreditService.updateSubscription(userId, subscriptionType as SubscriptionType, paymentId);
    
    const creditInfo = await CreditService.getCreditInfo(userId);
    
    return res.status(200).json({
      success: true,
      data: creditInfo
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при обновлении подписки';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
}; 