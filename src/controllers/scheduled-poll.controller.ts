import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ScheduledPoll, { IScheduledPoll } from '../models/scheduled-poll.model';
import User from '../models/user.model';
import { TelegramService } from '../services/telegram.service';
import Channel from '../models/channel.model';

/**
 * Create a new scheduled poll
 */
export const createScheduledPoll = async (req: Request, res: Response) => {
  try {
    const { channelId, question, options, isAnonymous, allowsMultipleAnswers, scheduledDate } = req.body;
    const userId = req.user?._id;

    if (!channelId || !question || !options || !scheduledDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: channelId, question, options, scheduledDate',
      });
    }

    // Validate scheduledDate is in the future
    const scheduledDateObj = new Date(scheduledDate);
    if (scheduledDateObj <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled date must be in the future',
      });
    }

    // Validate options
    if (!Array.isArray(options)) {
      return res.status(400).json({
        success: false,
        message: 'Options must be an array',
      });
    }

    // Telegram requires at least 2 and at most 10 options
    if (options.length < 2 || options.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Poll must have between 2 and 10 options',
      });
    }

    // Extract text from each option object if needed
    const optionTexts = options.map(option => {
      if (typeof option === 'string') return option;
      if (typeof option === 'object' && option.text) return option.text;
      return String(option);
    });

    const scheduledPoll = new ScheduledPoll({
      channelId,
      question,
      options: optionTexts,
      isAnonymous: isAnonymous !== undefined ? isAnonymous : true,
      allowsMultipleAnswers: allowsMultipleAnswers !== undefined ? allowsMultipleAnswers : false,
      scheduledDate: scheduledDateObj,
      published: false,
      user: userId,
    });

    await scheduledPoll.save();

    return res.status(201).json({
      success: true,
      message: 'Scheduled poll created successfully',
      data: scheduledPoll,
    });
  } catch (error) {
    console.error('Error creating scheduled poll:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create scheduled poll',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get all scheduled polls for a user
 */
export const getScheduledPolls = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const scheduledPolls = await ScheduledPoll.find({ 
      user: userId,
      published: false,
      scheduledDate: { $gt: new Date() }
    }).sort({ scheduledDate: 1 });

    return res.status(200).json({
      success: true,
      polls: scheduledPolls,
    });
  } catch (error) {
    console.error('Error getting scheduled polls:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get scheduled polls',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get a single scheduled poll by ID
 */
export const getScheduledPollById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;
    
    const scheduledPoll = await ScheduledPoll.findOne({
      _id: id,
      user: userId,
    });

    if (!scheduledPoll) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled poll not found',
      });
    }

    return res.status(200).json({
      success: true,
      poll: scheduledPoll,
    });
  } catch (error) {
    console.error('Error getting scheduled poll:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get scheduled poll',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Delete a scheduled poll
 */
export const deleteScheduledPoll = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    const scheduledPoll = await ScheduledPoll.findOneAndDelete({
      _id: id,
      user: userId,
      published: false,
    });

    if (!scheduledPoll) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled poll not found or already published',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Scheduled poll deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting scheduled poll:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete scheduled poll',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Update a scheduled poll
 */
export const updateScheduledPoll = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { question, options, isAnonymous, allowsMultipleAnswers, scheduledDate } = req.body;
    const userId = req.user?._id;

    // Validate scheduledDate is in the future if provided
    if (scheduledDate) {
      const scheduledDateObj = new Date(scheduledDate);
      if (scheduledDateObj <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled date must be in the future',
        });
      }
    }

    // Process options if provided
    let processedOptions;
    if (options) {
      if (!Array.isArray(options)) {
        return res.status(400).json({
          success: false,
          message: 'Options must be an array',
        });
      }

      // Telegram requires at least 2 and at most 10 options
      if (options.length < 2 || options.length > 10) {
        return res.status(400).json({
          success: false,
          message: 'Poll must have between 2 and 10 options',
        });
      }

      processedOptions = options.map(option => {
        if (typeof option === 'string') return option;
        if (typeof option === 'object' && option.text) return option.text;
        return String(option);
      });
    }

    const scheduledPoll = await ScheduledPoll.findOneAndUpdate(
      {
        _id: id,
        user: userId,
        published: false,
      },
      {
        ...(question && { question }),
        ...(processedOptions && { options: processedOptions }),
        ...(isAnonymous !== undefined && { isAnonymous }),
        ...(allowsMultipleAnswers !== undefined && { allowsMultipleAnswers }),
        ...(scheduledDate && { scheduledDate: new Date(scheduledDate) }),
      },
      { new: true }
    );

    if (!scheduledPoll) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled poll not found or already published',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Scheduled poll updated successfully',
      data: scheduledPoll,
    });
  } catch (error) {
    console.error('Error updating scheduled poll:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update scheduled poll',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Manually publish a scheduled poll
 */
export const publishScheduledPoll = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    // Find the poll
    const scheduledPoll = await ScheduledPoll.findOne({
      _id: id,
      user: userId,
      published: false,
    });

    if (!scheduledPoll) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled poll not found or already published',
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Find the channel to get the bot token
    const channel = await Channel.findOne({
      $or: [
        { _id: scheduledPoll.channelId },
        { id: scheduledPoll.channelId },
        { title: scheduledPoll.channelId }
      ],
      user: userId
    });

    if (!channel || !channel.botToken) {
      return res.status(404).json({
        success: false,
        message: 'Channel not found or missing bot token',
      });
    }

    // Prepare chat_id - if it looks like a username without @, add it
    let chatId = channel.username || channel.id;
    if (!chatId) {
      chatId = channel.title;
      if (chatId && !chatId.startsWith('@') && !chatId.match(/^-?\d+$/)) {
        chatId = '@' + chatId;
      }
    }

    // Create a Telegram service instance
    const telegramService = new TelegramService(channel.botToken);

    // Send the poll
    const pollResult = await telegramService.sendPoll(chatId, {
      question: scheduledPoll.question,
      options: scheduledPoll.options,
      isAnonymous: scheduledPoll.isAnonymous,
      allowsMultipleAnswers: scheduledPoll.allowsMultipleAnswers
    });

    if (!pollResult.success) {
      return res.status(400).json({
        success: false,
        message: `Failed to publish poll: ${pollResult.message}`,
      });
    }

    // Delete the poll instead of marking as published
    await ScheduledPoll.findByIdAndDelete(scheduledPoll._id);

    return res.status(200).json({
      success: true,
      message: 'Poll published and deleted successfully',
    });
  } catch (error) {
    console.error('Error publishing scheduled poll:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to publish scheduled poll',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}; 