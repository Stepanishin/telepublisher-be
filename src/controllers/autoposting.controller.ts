import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User, { IAutoPostingRule, Frequency, TimeUnit } from '../models/user.model';
import { generateText, generateImage } from '../services/openai.service';
import { publishToChannel } from '../services/telegram.service';
import { calculateNextScheduledDate } from '../utils/dateUtils';
import logger from '../utils/logger';

/**
 * Get all autoposting rules for the current user
 */
export const getAutoPostingRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: user.autoPostingRules || []
    });
  } catch (error) {
    logger.error('Error getting autoposting rules:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      message: 'Failed to get autoposting rules'
    });
  }
};

/**
 * Get a specific autoposting rule by ID
 */
export const getAutoPostingRuleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const ruleId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(ruleId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid rule ID'
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    const rule = user.autoPostingRules?.find(rule => rule._id?.toString() === ruleId);
    if (!rule) {
      res.status(404).json({
        success: false,
        message: 'Autoposting rule not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: rule
    });
  } catch (error) {
    logger.error('Error getting autoposting rule:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      message: 'Failed to get autoposting rule'
    });
  }
};

/**
 * Create a new autoposting rule
 */
export const createAutoPostingRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const {
      name,
      topic,
      status,
      frequency,
      customInterval,
      customTimeUnit,
      preferredTime,
      preferredDays,
      channelId,
      imageGeneration,
      keywords,
      buttons
    } = req.body;

    // Validate required fields
    if (!name || !topic || !frequency || !channelId) {
      res.status(400).json({
        success: false,
        message: 'Name, topic, frequency, and channelId are required'
      });
      return;
    }

    // Validate frequency-specific fields
    if (frequency === Frequency.CUSTOM && (!customInterval || !customTimeUnit)) {
      res.status(400).json({
        success: false,
        message: 'Custom interval and time unit are required for custom frequency'
      });
      return;
    }

    // For weekly frequency, validate preferredDays
    if (frequency === Frequency.WEEKLY && (!preferredDays || preferredDays.length === 0)) {
      res.status(400).json({
        success: false,
        message: 'Preferred days are required for weekly frequency'
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Validate that the channel exists
    // Try to find the channel by _id first, then by username if _id fails
    const channelExists = user.channels.some(channel => 
      channel._id?.toString() === channelId || 
      channel.username === channelId
    );
    
    if (!channelExists) {
      res.status(400).json({
        success: false,
        message: 'Channel not found'
      });
      return;
    }

    // Create new rule
    const newRule: IAutoPostingRule = {
      name,
      topic,
      status: status || 'active',
      frequency,
      customInterval,
      customTimeUnit,
      preferredTime: preferredTime || '12:00',
      preferredDays: preferredDays || ['monday', 'wednesday', 'friday'],
      channelId,
      imageGeneration: imageGeneration !== undefined ? imageGeneration : false,
      keywords: keywords || [],
      buttons: buttons || [],
      nextScheduled: calculateNextScheduledDate({
        frequency,
        customInterval,
        customTimeUnit,
        preferredTime,
        preferredDays
      }),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add rule to user
    if (!user.autoPostingRules) {
      user.autoPostingRules = [];
    }
    user.autoPostingRules.push(newRule);
    await user.save();

    res.status(201).json({
      success: true,
      data: newRule,
      message: 'Autoposting rule created successfully'
    });
  } catch (error) {
    logger.error('Error creating autoposting rule:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      message: 'Failed to create autoposting rule'
    });
  }
};

/**
 * Update an existing autoposting rule
 */
export const updateAutoPostingRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const ruleId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(ruleId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid rule ID'
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    if (!user.autoPostingRules) {
      res.status(404).json({
        success: false,
        message: 'No autoposting rules found'
      });
      return;
    }

    const ruleIndex = user.autoPostingRules.findIndex(rule => rule._id?.toString() === ruleId);
    if (ruleIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Autoposting rule not found'
      });
      return;
    }

    const rule = user.autoPostingRules[ruleIndex];
    const {
      name,
      topic,
      status,
      frequency,
      customInterval,
      customTimeUnit,
      preferredTime,
      preferredDays,
      channelId,
      imageGeneration,
      keywords,
      buttons
    } = req.body;

    // Update fields if provided
    if (name) rule.name = name;
    if (topic) rule.topic = topic;
    if (status !== undefined) rule.status = status;
    
    // Handle frequency-related changes
    let shouldRecalculateNextScheduled = false;
    
    if (frequency) {
      rule.frequency = frequency;
      shouldRecalculateNextScheduled = true;
    }
    
    if (customInterval !== undefined) {
      rule.customInterval = customInterval;
      shouldRecalculateNextScheduled = true;
    }
    
    if (customTimeUnit) {
      rule.customTimeUnit = customTimeUnit;
      shouldRecalculateNextScheduled = true;
    }
    
    if (preferredTime) {
      rule.preferredTime = preferredTime;
      shouldRecalculateNextScheduled = true;
    }
    
    if (preferredDays) {
      rule.preferredDays = preferredDays;
      shouldRecalculateNextScheduled = true;
    }
    
    if (channelId) {
      // Validate that the channel exists
      const channelExists = user.channels.some(channel => 
        channel._id?.toString() === channelId || 
        channel.username === channelId
      );
      
      if (!channelExists) {
        res.status(400).json({
          success: false,
          message: 'Channel not found'
        });
        return;
      }
      rule.channelId = channelId;
    }
    
    if (imageGeneration !== undefined) rule.imageGeneration = imageGeneration;
    if (keywords) rule.keywords = keywords;
    if (buttons !== undefined) rule.buttons = buttons;
    
    // Recalculate next scheduled date if needed
    if (shouldRecalculateNextScheduled) {
      rule.nextScheduled = calculateNextScheduledDate({
        frequency: rule.frequency,
        customInterval: rule.customInterval,
        customTimeUnit: rule.customTimeUnit,
        preferredTime: rule.preferredTime,
        preferredDays: rule.preferredDays
      });
    }
    
    rule.updatedAt = new Date();
    
    await user.save();
    
    res.status(200).json({
      success: true,
      data: rule,
      message: 'Autoposting rule updated successfully'
    });
  } catch (error) {
    logger.error('Error updating autoposting rule:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      message: 'Failed to update autoposting rule'
    });
  }
};

/**
 * Delete an autoposting rule
 */
export const deleteAutoPostingRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const ruleId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(ruleId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid rule ID'
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    if (!user.autoPostingRules) {
      res.status(404).json({
        success: false,
        message: 'No autoposting rules found'
      });
      return;
    }

    const initialLength = user.autoPostingRules.length;
    user.autoPostingRules = user.autoPostingRules.filter(rule => rule._id?.toString() !== ruleId);

    if (user.autoPostingRules.length === initialLength) {
      res.status(404).json({
        success: false,
        message: 'Autoposting rule not found'
      });
      return;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Autoposting rule deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting autoposting rule:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      message: 'Failed to delete autoposting rule'
    });
  }
};

/**
 * Get autoposting history
 */
export const getAutoPostingHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    const history = user.autoPostingHistory || [];
    const totalItems = history.length;
    
    // Sort history by publishedAt (newest first) and apply pagination
    const paginatedHistory = history
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(skip, skip + limit);

    res.status(200).json({
      success: true,
      data: {
        history: paginatedHistory,
        pagination: {
          total: totalItems,
          page,
          limit,
          totalPages: Math.ceil(totalItems / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error getting autoposting history:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      message: 'Failed to get autoposting history'
    });
  }
};

/**
 * Execute autoposting rule (for testing or manual trigger)
 */
export const executeAutoPostingRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const ruleId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(ruleId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid rule ID'
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    if (!user.autoPostingRules) {
      res.status(404).json({
        success: false,
        message: 'No autoposting rules found'
      });
      return;
    }

    const rule = user.autoPostingRules.find(rule => rule._id?.toString() === ruleId);
    if (!rule) {
      res.status(404).json({
        success: false,
        message: 'Autoposting rule not found'
      });
      return;
    }

    // Check if rule is active
    if (rule.status !== 'active') {
      res.status(400).json({
        success: false,
        message: 'Cannot execute inactive autoposting rule'
      });
      return;
    }

    // Check if user has enough credits
    let requiredCredits = rule.imageGeneration ? 3 : 1; // 1 for text, +2 for image
    if (user.aiCredits < requiredCredits) {
      res.status(400).json({
        success: false,
        message: 'Not enough AI credits to execute autoposting rule',
        data: {
          required: requiredCredits,
          available: user.aiCredits
        }
      });
      return;
    }

    // Generate content
    const topic = rule.topic;
    const keywordsText = rule.keywords && rule.keywords.length > 0 
      ? ` Include these keywords if possible: ${rule.keywords.join(', ')}.`
      : '';
    
    // Array of different prompt templates for text generation
    const promptTemplates = [
      `Create a concise post about ${topic} for a Telegram channel. Make it engaging and informative.${keywordsText} The post should be formatted for Telegram and be between 100-200 words maximum.`,
      `Write a creative Telegram post about ${topic} with a unique angle or perspective.${keywordsText} Keep it under 200 words and make it stand out from typical content on this topic.`,
      `Compose an engaging Telegram channel update on ${topic}.${keywordsText} Be conversational and direct. Keep it concise (under 200 words) while still being informative.`,
      `Draft a captivating Telegram post discussing recent developments in ${topic}.${keywordsText} Use an attention-grabbing opening and maintain reader interest throughout. Limit to 200 words.`,
      `Create insider content about ${topic} for a Telegram audience.${keywordsText} Share valuable insights in a compelling way. Keep it concise (100-200 words) and easy to read on mobile devices.`
    ];
    
    // Randomly select a prompt template
    const randomPrompt = promptTemplates[Math.floor(Math.random() * promptTemplates.length)];
    
    const generatedText = await generateText(randomPrompt);
    let generatedImageUrl: string | null = null;
    
    if (rule.imageGeneration) {
      try {
        // Clean the topic string to ensure it contains only Latin characters and common symbols
        const sanitizedTopic = topic
          .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII characters
          .trim();
        
        // If after sanitization there's still content, use it. Otherwise, use a generic prompt
        const imagePrompt = sanitizedTopic 
          ? `Create an image related to: ${sanitizedTopic}` 
          : `Create an abstract image related to finance and technology`;
        
        generatedImageUrl = await generateImage(imagePrompt);
      } catch (error) {
        logger.warn(`Failed to generate image for rule ${rule._id}, continuing without image`, {
          ruleId: rule._id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Don't fail the whole posting process if only the image generation fails
        // Just continue without an image
        generatedImageUrl = null;
        
        // Adjust required credits since we're not generating an image
        requiredCredits = 1; // Only charge for text generation
      }
    }

    // Find the channel for this rule
    const channel = user.channels.find(ch => ch._id?.toString() === rule.channelId.toString());
    if (!channel) {
      res.status(404).json({
        success: false,
        message: 'Channel not found'
      });
      return;
    }

    // Publish to Telegram
    const publishResult = await publishToChannel({
      channelUsername: channel.username,
      botToken: channel.botToken || '',
      text: generatedText,
      imageUrl: generatedImageUrl || undefined,
      buttons: rule.buttons
    });

    // Update user's credits
    user.aiCredits -= requiredCredits;
    user.totalCreditsUsed += requiredCredits;

    // Update rule's lastPublished date
    rule.lastPublished = new Date();
    
    // Calculate and update next scheduled date
    rule.nextScheduled = calculateNextScheduledDate({
      frequency: rule.frequency,
      customInterval: rule.customInterval,
      customTimeUnit: rule.customTimeUnit,
      preferredTime: rule.preferredTime,
      preferredDays: rule.preferredDays
    });

    // Add to history
    if (!user.autoPostingHistory) {
      user.autoPostingHistory = [];
    }
    
    user.autoPostingHistory.push({
      ruleId: rule._id!,
      ruleName: rule.name,
      postId: publishResult.messageId,
      content: generatedText,
      imageUrl: generatedImageUrl || undefined,
      buttons: rule.buttons,
      status: publishResult.success ? 'success' : 'failed',
      error: publishResult.success ? undefined : publishResult.error,
      publishedAt: new Date()
    });

    await user.save();

    res.status(200).json({
      success: true,
      data: {
        publishResult,
        rule,
        creditsUsed: requiredCredits
      },
      message: 'Autoposting rule executed successfully'
    });
  } catch (error) {
    logger.error('Error executing autoposting rule:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      message: 'Failed to execute autoposting rule',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 