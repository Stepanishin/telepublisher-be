import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User, { IAutoPostingRule, Frequency, TimeUnit } from '../models/user.model';
import { generateText, generateImage } from '../services/openai.service';
import { publishToChannel } from '../services/telegram.service';
import { calculateNextScheduledDate } from '../utils/dateUtils';
import webScraperService from '../services/webScraper.service';
import contentDuplicationService from '../services/contentDuplication.service';
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
      buttons,
      sourceUrls,
      avoidDuplication,
      duplicateCheckDays
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

    // Validate sourceUrls if provided
    if (sourceUrls && Array.isArray(sourceUrls)) {
      for (const url of sourceUrls) {
        try {
          new URL(url);
        } catch {
          res.status(400).json({
            success: false,
            message: `Invalid URL: ${url}`
          });
          return;
        }
      }
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
      sourceUrls: sourceUrls || [],
      avoidDuplication: avoidDuplication || false,
      duplicateCheckDays: duplicateCheckDays || 7,
      contentHistory: [],
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
      buttons,
      sourceUrls,
      avoidDuplication,
      duplicateCheckDays
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
    
    // Handle sourceUrls
    if (sourceUrls !== undefined) {
      // Validate sourceUrls if provided
      if (Array.isArray(sourceUrls)) {
        for (const url of sourceUrls) {
          try {
            new URL(url);
          } catch {
            res.status(400).json({
              success: false,
              message: `Invalid URL: ${url}`
            });
            return;
          }
        }
        rule.sourceUrls = sourceUrls;
      } else {
        rule.sourceUrls = [];
      }
    }
    
    // Handle duplication settings
    if (avoidDuplication !== undefined) {
      rule.avoidDuplication = avoidDuplication;
    }
    
    if (duplicateCheckDays !== undefined) {
      rule.duplicateCheckDays = Math.max(1, Math.min(30, duplicateCheckDays)); // Limit between 1-30 days
    }
    
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
    
    let contextText = '';
    let hasScrapedContent = false;
    
    // If source URLs are provided, scrape content from them
    if (rule.sourceUrls && rule.sourceUrls.length > 0) {
      try {
        logger.info(`AutoPostingController: Scraping content from ${rule.sourceUrls.length} URLs for rule ${rule._id}`);
        
        const scrapedContents = await webScraperService.scrapeUrls(rule.sourceUrls);
        
        if (scrapedContents.length > 0) {
          hasScrapedContent = true;
          
          // Create detailed context from scraped content
          contextText = '\n\n--- IMPORTANT: Use the following RECENT INFORMATION as the PRIMARY BASIS for the post ---\n';
          
          scrapedContents.forEach((content, index) => {
            contextText += `\nArticle ${index + 1}:\n`;
            contextText += `Title: ${content.title}\n`;
            
            if (content.description) {
              contextText += `Description: ${content.description}\n`;
            }
            
            if (content.content && content.content.length > 0) {
              // Include more content for better context
              const contentPreview = content.content.length > 500 
                ? content.content.substring(0, 500) + '...'
                : content.content;
              contextText += `Content: ${contentPreview}\n`;
            }
            
            if (content.author) {
              contextText += `Author: ${content.author}\n`;
            }
            
            if (content.publishDate) {
              contextText += `Published: ${content.publishDate.toLocaleDateString()}\n`;
            }
            
            contextText += `Source: ${content.url}\n`;
            contextText += '---\n';
          });
          
          contextText += '\nIMPORTANT INSTRUCTIONS:\n';
          contextText += '- Base your post primarily on the information above\n';
          contextText += '- Synthesize insights from all articles\n';
          contextText += '- Include specific details, facts, or quotes from the sources\n';
          contextText += '- Reference the most interesting or newsworthy points\n';
          contextText += '- Make the post feel fresh and current\n';
          
          logger.info(`AutoPostingController: Successfully scraped ${scrapedContents.length} articles for rule ${rule._id}`);
        } else {
          logger.warn(`AutoPostingController: No content could be scraped from provided URLs for rule ${rule._id}`);
        }
      } catch (error) {
        logger.error(`AutoPostingController: Error scraping content for rule ${rule._id}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue without scraped content
      }
    }
    
    // Create different prompts based on whether we have scraped content
    let prompt: string;
    
    if (hasScrapedContent) {
      // When we have scraped content, prioritize it over random templates
      prompt = `You are creating a Telegram post about "${topic}" based on recent information from reliable sources.${contextText}

Create an engaging, informative Telegram post that:
1. PRIORITIZES the information from the sources above
2. Presents the key insights in an engaging way
3. Uses a conversational tone suitable for Telegram
4. Is between 150-300 words
5. Includes relevant emojis where appropriate${keywordsText}

Focus on making the content feel current, newsworthy, and valuable to readers.`;
    } else {
      // Use random templates only when no scraped content is available
      const promptTemplates = [
        `Create a concise post about ${topic} for a Telegram channel. Make it engaging and informative.${keywordsText} The post should be formatted for Telegram and be between 100-200 words maximum.`,
        `Write a creative Telegram post about ${topic} with a unique angle or perspective.${keywordsText} Keep it under 200 words and make it stand out from typical content on this topic.`,
        `Compose an engaging Telegram channel update on ${topic}.${keywordsText} Be conversational and direct. Keep it concise (under 200 words) while still being informative.`,
        `Draft a captivating Telegram post discussing recent developments in ${topic}.${keywordsText} Use an attention-grabbing opening and maintain reader interest throughout. Limit to 200 words.`,
        `Create insider content about ${topic} for a Telegram audience.${keywordsText} Share valuable insights in a compelling way. Keep it concise (100-200 words) and easy to read on mobile devices.`
      ];
      
      // Randomly select a prompt template
      prompt = promptTemplates[Math.floor(Math.random() * promptTemplates.length)];
    }
    
    // Log the final prompt for debugging
    logger.info(`AutoPostingController: Final prompt for rule ${rule._id}:`, {
      hasScrapedContent,
      promptLength: prompt.length,
      prompt: prompt.substring(0, 500) + (prompt.length > 500 ? '...' : '')
    });
    
    let generatedText = await generateText(prompt);
    
    // Check for content duplication if enabled
    if (rule.avoidDuplication) {
      logger.info(`AutoPostingController: Checking content duplication for rule ${rule._id}`);
      
      const duplicateCheck = await contentDuplicationService.checkContentDuplication(
        generatedText,
        rule.contentHistory || [],
        0.7 // 70% similarity threshold
      );
      
      if (duplicateCheck.isSimilar) {
        logger.warn(`AutoPostingController: Duplicate content detected for rule ${rule._id}`, {
          similarity: duplicateCheck.similarity,
          reason: duplicateCheck.reason
        });
        
        // Generate alternative content with anti-duplication instructions
        const antiDupPrompt = contentDuplicationService.generateAntiDuplicationPrompt(
          prompt,
          generatedText
        );
        
        logger.info(`AutoPostingController: Regenerating content with anti-duplication prompt for rule ${rule._id}`);
        generatedText = await generateText(antiDupPrompt);
      } else {
        logger.info(`AutoPostingController: Content is unique for rule ${rule._id}`, {
          similarity: duplicateCheck.similarity
        });
      }
    }
    
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
    
    // Save content to history for duplication checking (only for successful posts)
    if (rule.avoidDuplication && publishResult.success) {
      const contentSummary = contentDuplicationService.createContentSummary(generatedText);
      
      if (!rule.contentHistory) {
        rule.contentHistory = [];
      }
      
      rule.contentHistory.push(contentSummary);
      
      // Clean up old content history
      rule.contentHistory = contentDuplicationService.cleanContentHistory(
        rule.contentHistory,
        rule.duplicateCheckDays || 7
      );
      
      logger.info(`AutoPostingController: Saved content to history for rule ${rule._id}`, {
        historyLength: rule.contentHistory.length,
        checkDays: rule.duplicateCheckDays || 7
      });
    }
    
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