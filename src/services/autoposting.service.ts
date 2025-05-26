import User from '../models/user.model';
import { generateText, generateImage } from './openai.service';
import { publishToChannel } from './telegram.service';
import { calculateNextScheduledDate } from '../utils/dateUtils';
import logger from '../utils/logger';

class AutoPostingService {
  /**
   * Check for and process rules that are due for publication
   */
  async processDueRules(): Promise<number> {
    try {
      logger.info('AutoPostingService: Starting scheduled rule processing');
      
      // Find all users with active autoposting rules
      const users = await User.find({
        'autoPostingRules.status': 'active',
        'autoPostingRules.nextScheduled': { $lte: new Date() }
      });
      
      let processedCount = 0;
      
      for (const user of users) {
        if (!user.autoPostingRules) continue;
        
        // Filter rules that are due for publishing
        const dueRules = user.autoPostingRules.filter(rule => 
          rule.status === 'active' && 
          rule.nextScheduled && 
          rule.nextScheduled <= new Date()
        );
        
        if (dueRules.length === 0) continue;
        
        for (const rule of dueRules) {
          try {
            // Check if user has enough credits
            let requiredCredits = rule.imageGeneration ? 3 : 1; // 1 for text, +2 for image
            
            if (user.aiCredits < requiredCredits) {
              logger.warn(`AutoPostingService: User ${user._id} doesn't have enough credits for rule ${rule._id}`, {
                userId: user._id,
                ruleId: rule._id,
                required: requiredCredits,
                available: user.aiCredits
              });
              
              // Add to history as failed
              if (!user.autoPostingHistory) {
                user.autoPostingHistory = [];
              }
              
              user.autoPostingHistory.push({
                ruleId: rule._id!,
                ruleName: rule.name,
                status: 'failed',
                error: 'Not enough AI credits',
                publishedAt: new Date()
              });
              
              // Still update the next scheduled date
              rule.nextScheduled = calculateNextScheduledDate({
                frequency: rule.frequency,
                customInterval: rule.customInterval,
                customTimeUnit: rule.customTimeUnit,
                preferredTime: rule.preferredTime,
                preferredDays: rule.preferredDays
              });
              
              continue;
            }
            
            // Generate content
            const topic = rule.topic;
            const keywordsText = rule.keywords && rule.keywords.length > 0 
              ? ` Include these keywords if possible: ${rule.keywords.join(', ')}.`
              : '';
            
            const prompt = `Create a post about ${topic} for a Telegram channel. Make it engaging and informative.${keywordsText} The post should be formatted for Telegram and be between 100-300 words.`;
            
            const generatedText = await generateText(prompt);
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
                logger.warn(`AutoPostingService: Failed to generate image for rule ${rule._id}, continuing without image`, {
                  userId: user._id,
                  ruleId: rule._id,
                  error: error instanceof Error ? error.message : 'Unknown error'
                });
                
                // Don't fail the whole posting process if only the image generation fails
                // Just continue without an image
                generatedImageUrl = null;
                
                // Adjust required credits since we're not generating an image
                user.aiCredits += 2; // Add back the 2 credits for image generation
              }
            }
            
            // Find the channel for this rule
            const channel = user.channels.find(ch => ch._id?.toString() === rule.channelId.toString());
            if (!channel) {
              throw new Error(`Channel not found for rule ${rule._id}`);
            }
            
            // Publish to Telegram
            const publishResult = await publishToChannel({
              channelUsername: channel.username,
              botToken: channel.botToken || '',
              text: generatedText,
              imageUrl: generatedImageUrl || undefined
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
              status: publishResult.success ? 'success' : 'failed',
              error: publishResult.success ? undefined : publishResult.error,
              publishedAt: new Date()
            });
            
            processedCount++;
            
            logger.info(`AutoPostingService: Successfully processed rule ${rule._id} for user ${user._id}`, {
              userId: user._id,
              ruleId: rule._id,
              channelUsername: channel.username
            });
          } catch (error) {
            logger.error(`AutoPostingService: Error processing rule ${rule._id} for user ${user._id}`, {
              userId: user._id,
              ruleId: rule._id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            // Add to history as failed
            if (!user.autoPostingHistory) {
              user.autoPostingHistory = [];
            }
            
            user.autoPostingHistory.push({
              ruleId: rule._id!,
              ruleName: rule.name,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
              publishedAt: new Date()
            });
            
            // Still update the next scheduled date
            rule.nextScheduled = calculateNextScheduledDate({
              frequency: rule.frequency,
              customInterval: rule.customInterval,
              customTimeUnit: rule.customTimeUnit,
              preferredTime: rule.preferredTime,
              preferredDays: rule.preferredDays
            });
          }
        }
        
        // Save user changes
        await user.save();
      }
      
      logger.info(`AutoPostingService: Completed processing ${processedCount} rules`);
      return processedCount;
    } catch (error) {
      logger.error('AutoPostingService: Error processing scheduled rules', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return 0;
    }
  }
}

export default new AutoPostingService(); 