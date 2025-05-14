import { Request, Response } from 'express';
import User from '../models/user.model';
import mongoose from 'mongoose';
import CreditService from '../services/credit.service';

// Получить каналы пользователя
export const getUserChannels = async (req: Request, res: Response): Promise<void> => {
  try {
    // @ts-ignore - user добавляется через middleware аутентификации
    const userId = req.user.id;
    
    const user = await User.findById(userId);
    
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      channels: user.channels || [],
    });
  } catch (error) {
    console.error('Error fetching user channels:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении каналов',
      error: (error as Error).message,
    });
  }
};

// Добавить новый канал
export const addChannel = async (req: Request, res: Response): Promise<void> => {
  console.log('addChannel', req.body);
  try {
    // @ts-ignore - user добавляется через middleware аутентификации
    const userId = req.user.id;
    const { username, title, botToken } = req.body;
    
    // Проверка обязательных полей
    if (!username || !title) {
      res.status(400).json({
        success: false,
        message: 'Поля username и title обязательны',
      });
      return;
    }
    
    // Проверка лимита каналов для текущей подписки
    const channelLimitCheck = await CreditService.canAddChannel(userId);
    
    if (!channelLimitCheck.allowed) {
      res.status(403).json({
        success: false,
        message: `Достигнут лимит каналов для вашей подписки (${channelLimitCheck.limit})`,
        limitReached: true,
        channelLimit: channelLimitCheck.limit,
        currentCount: channelLimitCheck.current
      });
      return;
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
      return;
    }
    
    // Проверка, существует ли канал с таким username
    const channelExists = user.channels.some(channel => channel.username === username);
    if (channelExists) {
      res.status(400).json({
        success: false,
        message: 'Канал с таким username уже существует',
      });
      return;
    }
    
    // Создание нового канала с уникальным ID
    const newChannel = {
      _id: new mongoose.Types.ObjectId(),
      username,
      title,
      botToken: botToken || '',
    };
    
    // Добавление канала к пользователю
    user.channels.push(newChannel);
    await user.save();
    
    res.status(201).json({
      success: true,
      message: 'Канал успешно добавлен',
      channel: {
        id: newChannel._id,
        username: newChannel.username,
        title: newChannel.title,
        botToken: newChannel.botToken,
      },
    });
  } catch (error) {
    console.error('Error adding channel:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при добавлении канала',
      error: (error as Error).message,
    });
  }
};

// Обновить канал
export const updateChannel = async (req: Request, res: Response): Promise<void> => {
  try {
    // @ts-ignore - user добавляется через middleware аутентификации
    const userId = req.user.id;
    const { channelId } = req.params;
    const { title, botToken } = req.body;
    
    // Проверка ID канала
    if (!channelId) {
      res.status(400).json({
        success: false,
        message: 'ID канала обязателен',
      });
      return;
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
      return;
    }
    
    // Найти канал по ID
    const channelIndex = user.channels.findIndex(
      channel => channel._id?.toString() === channelId
    );
    
    if (channelIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Канал не найден',
      });
      return;
    }
    
    // Обновить данные канала
    if (title) {
      user.channels[channelIndex].title = title;
    }
    
    if (botToken !== undefined) {
      user.channels[channelIndex].botToken = botToken;
    }
    
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Канал успешно обновлен',
      channel: {
        id: user.channels[channelIndex]._id,
        username: user.channels[channelIndex].username,
        title: user.channels[channelIndex].title,
        botToken: user.channels[channelIndex].botToken,
      },
    });
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении канала',
      error: (error as Error).message,
    });
  }
};

// Удалить канал
export const deleteChannel = async (req: Request, res: Response): Promise<void> => {
  try {
    // @ts-ignore - user добавляется через middleware аутентификации
    const userId = req.user.id;
    const { channelId } = req.params;
    
    // Проверка ID канала
    if (!channelId) {
      res.status(400).json({
        success: false,
        message: 'ID канала обязателен',
      });
      return;
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
      return;
    }
    
    // Проверить, существует ли канал
    const channelIndex = user.channels.findIndex(
      channel => channel._id?.toString() === channelId
    );
    
    if (channelIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Канал не найден',
      });
      return;
    }
    
    // Удалить канал из массива
    user.channels.splice(channelIndex, 1);
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Канал успешно удален',
    });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при удалении канала',
      error: (error as Error).message,
    });
  }
};

// Получить информацию о лимите каналов для текущей подписки
export const getChannelLimits = async (req: Request, res: Response): Promise<void> => {
  try {
    // @ts-ignore - user добавляется через middleware аутентификации
    const userId = req.user.id;
    
    const channelLimitInfo = await CreditService.canAddChannel(userId);
    
    res.status(200).json({
      success: true,
      data: {
        allowed: channelLimitInfo.allowed,
        limit: channelLimitInfo.limit,
        current: channelLimitInfo.current
      }
    });
  } catch (error) {
    console.error('Error getting channel limits:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении информации о лимитах каналов',
      error: (error as Error).message,
    });
  }
}; 