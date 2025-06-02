import User from '../models/user.model';
import { generateText, generateImage } from './openai.service';
import { publishToChannel } from './telegram.service';
import { calculateNextScheduledDate } from '../utils/dateUtils';
import webScraperService from './webScraper.service';
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
            
            let contextText = '';
            let hasScrapedContent = false;
            
            // If source URLs are provided, scrape content from them
            if (rule.sourceUrls && rule.sourceUrls.length > 0) {
              try {
                logger.info(`AutoPostingService: Scraping content from ${rule.sourceUrls.length} URLs for rule ${rule._id}`);
                
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
                  
                  logger.info(`AutoPostingService: Successfully scraped ${scrapedContents.length} articles for rule ${rule._id}`);
                } else {
                  logger.warn(`AutoPostingService: No content could be scraped from provided URLs for rule ${rule._id}`);
                }
              } catch (error) {
                logger.error(`AutoPostingService: Error scraping content for rule ${rule._id}`, {
                  error: error instanceof Error ? error.message : 'Unknown error'
                });
                // Continue without scraped content
              }
            }
            
            // Create different prompts based on whether we have scraped content
            let prompt: string;
            
            if (hasScrapedContent) {
              prompt = `You are creating a Telegram post about "${topic}" based on recent information from reliable sources.${contextText}

Create an engaging, informative Telegram post that:
1. PRIORITIZES the information from the sources above
2. Presents the key insights in an engaging way
3. Uses a conversational tone suitable for Telegram
4. Is between 150-300 words
5. Includes relevant emojis where appropriate${keywordsText}

Focus on making the content feel current, newsworthy, and valuable to readers.`;
            } else {
              prompt = `Create a post about ${topic} for a Telegram channel. Make it engaging and informative.${keywordsText} The post should be formatted for Telegram and be between 100-300 words.`;
            }
            
            // Log the final prompt for debugging
            logger.info(`AutoPostingService: Final prompt for rule ${rule._id}:`, {
              hasScrapedContent,
              promptLength: prompt.length,
              prompt: prompt.substring(0, 500) + (prompt.length > 500 ? '...' : '')
            });
            
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
                
                logger.info(`AutoPostingService: Generating image for rule ${rule._id} with prompt: ${imagePrompt}`);
                generatedImageUrl = await generateImage(imagePrompt);
                logger.info(`AutoPostingService: Successfully generated image for rule ${rule._id}. URL: ${generatedImageUrl}`);
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
            logger.info(`AutoPostingService: Publishing to Telegram for rule ${rule._id}`, {
              channelUsername: channel.username,
              hasImage: !!generatedImageUrl,
              imagePosition: rule.imagePosition || 'bottom',
              contentLength: generatedText.length
            });
            
            const publishResult = await publishToChannel({
              channelUsername: channel.username,
              botToken: channel.botToken || '',
              text: generatedText,
              imageUrl: generatedImageUrl || undefined,
              buttons: rule.buttons,
              imagePosition: rule.imagePosition || 'bottom' // Use 'bottom' as default to show image as link preview
            });
            
            if (!publishResult.success) {
              logger.error(`AutoPostingService: Failed to publish to Telegram for rule ${rule._id}`, {
                error: publishResult.error
              });
            } else {
              logger.info(`AutoPostingService: Successfully published to Telegram for rule ${rule._id}`, {
                messageId: publishResult.messageId
              });
            }
            
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
              imagePosition: rule.imagePosition || 'bottom',
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