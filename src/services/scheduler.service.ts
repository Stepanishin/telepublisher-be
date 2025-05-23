import cron from 'node-cron';
import ScheduledPost from '../models/scheduled-post.model';
import ScheduledPoll from '../models/scheduled-poll.model';
import User from '../models/user.model';
import { publishToTelegram } from './telegram.service';
import { TelegramService } from './telegram.service';
import mongoose from 'mongoose';
import { cleanupOldImages, cleanupDraftMetadata } from './cleanup.service';

class SchedulerService {
  private running: boolean = false;
  private postsPollsJob: cron.ScheduledTask | null = null;
  private cleanupJob: cron.ScheduledTask | null = null;

  /**
   * Start the scheduler
   */
  public start(): void {
    if (this.running) {
      console.log('Scheduler is already running');
      return;
    }

    // Schedule the task to run every minute for posts and polls
    this.postsPollsJob = cron.schedule('* * * * *', async () => {
      try {
        await this.processScheduledPosts();
        await this.processScheduledPolls();
      } catch (error) {
        console.error('Error in scheduler service:', error);
      }
    });

    // Schedule image cleanup to run once per day at midnight (0 0 * * *)
    this.cleanupJob = cron.schedule('0 0 * * *', async () => {
      try {
        console.log('Running daily image cleanup...');
        await cleanupOldImages();
        console.log('Daily image cleanup completed');
      } catch (error) {
        console.error('Error in image cleanup service:', error);
      }
    });

    this.running = true;
    console.log('Scheduler started successfully');
    
    // Clean up draft metadata first to fix any inconsistencies
    cleanupDraftMetadata()
      .then(() => console.log('Draft metadata cleanup completed'))
      .catch(err => console.error('Error during draft metadata cleanup:', err));
    
    // Run an initial cleanup on startup
    cleanupOldImages()
      .then(() => console.log('Initial image cleanup completed'))
      .catch(err => console.error('Error during initial image cleanup:', err));
  }

  /**
   * Stop the scheduler
   */
  public stop(): void {
    if (this.postsPollsJob) {
      this.postsPollsJob.stop();
      this.postsPollsJob = null;
    }
    
    if (this.cleanupJob) {
      this.cleanupJob.stop();
      this.cleanupJob = null;
    }
    
    this.running = false;
    console.log('Scheduler stopped');
  }

  /**
   * Process due scheduled posts
   */
  private async processScheduledPosts(): Promise<void> {
    try {
      // Get current time
      const now = new Date();
      
      // Find scheduled posts that are due for publishing
      const duePosts = await ScheduledPost.find({
        published: false,
        scheduledDate: { $lte: now }
      });

      if (duePosts.length === 0) {
        return;
      }

      console.log(`Found ${duePosts.length} scheduled posts to publish`);

      // Process each post
      for (const post of duePosts) {
        try {
          console.log(`Processing post ID: ${post._id}, scheduled for: ${post.scheduledDate}`);
          
          // First we need to find the user who owns the channel
          const user = await User.findOne({
            _id: post.user
          });
          
          if (!user) {
            console.error(`User not found for scheduled post ${post._id}`);
            continue;
          }

          // Find the channel in the user's channels array
          const channel = user.channels.find(c => {
            if (!c._id) return false;
            return c._id.toString() === post.channelId.toString();
          });

          if (!channel || !channel.botToken) {
            console.error(`Channel not found or missing bot token for post ${post._id}`);
            continue;
          }

          console.log(`Publishing to channel: ${channel.title || channel.username}`);
          
          // Check if we have multiple images
          if (post.imageUrls && post.imageUrls.length > 0) {
            console.log(`Post has ${post.imageUrls.length} images in imageUrls array`);
          } else if (post.imageUrl) {
            console.log(`Post has a single image: ${post.imageUrl}`);
          } else {
            console.log(`Post is text-only`);
          }

          // Publish to Telegram
          const result = await publishToTelegram(
            channel.username, 
            channel.botToken, 
            post.text, 
            post.imageUrl,
            post.imageUrls,
            post.tags
          );
          
          // Delete the post instead of marking as published
          await ScheduledPost.findByIdAndDelete(post._id);

          console.log(`Published and deleted scheduled post ${post._id} - ${result.success ? 'Success' : 'Failed: ' + result.message}`);
        } catch (postError) {
          console.error(`Error processing scheduled post ${post._id}:`, postError);
        }
      }
    } catch (error) {
      console.error('Error in scheduler service:', error);
    }
  }

  /**
   * Process due scheduled polls
   */
  private async processScheduledPolls(): Promise<void> {
    try {
      // Get current time
      const now = new Date();
      
      // Find scheduled polls that are due for publishing
      const duePolls = await ScheduledPoll.find({
        published: false,
        scheduledDate: { $lte: now }
      });

      if (duePolls.length === 0) {
        return;
      }

      console.log(`Found ${duePolls.length} scheduled polls to publish`);

      // Process each poll
      for (const poll of duePolls) {
        try {
          console.log(`Processing poll ID: ${poll._id}, scheduled for: ${poll.scheduledDate}`);
          
          // First we need to find the user who owns the channel
          const user = await User.findOne({
            _id: poll.user
          });
          
          if (!user) {
            console.error(`User not found for scheduled poll ${poll._id}`);
            continue;
          }

          // Find the channel in the user's channels array
          const channel = user.channels.find(c => {
            if (!c._id) return false;
            return c._id.toString() === poll.channelId.toString();
          });

          if (!channel || !channel.botToken) {
            console.error(`Channel not found or missing bot token for poll ${poll._id}`);
            continue;
          }

          console.log(`Publishing poll to channel: ${channel.title || channel.username}`);

          // Prepare chat_id for Telegram API
          let chatId = channel.username;
          if (chatId && !chatId.startsWith('@') && !chatId.match(/^-?\d+$/)) {
            chatId = '@' + chatId;
          }

          // Use the TelegramService to publish the poll
          const telegramService = new TelegramService(channel.botToken);
          const result = await telegramService.sendPoll(chatId, {
            question: poll.question,
            options: poll.options,
            isAnonymous: poll.isAnonymous,
            allowsMultipleAnswers: poll.allowsMultipleAnswers
          });
          
          if (result.success) {
            // Delete the poll instead of marking as published
            await ScheduledPoll.findByIdAndDelete(poll._id);
            console.log(`Published and deleted scheduled poll ${poll._id} successfully`);
          } else {
            console.error(`Failed to publish poll ${poll._id}: ${result.message}`);
          }
        } catch (pollError) {
          console.error(`Error processing scheduled poll ${poll._id}:`, pollError);
        }
      }
    } catch (error) {
      console.error('Error in scheduler service (polls):', error);
    }
  }
}

// Create a singleton instance
const schedulerService = new SchedulerService();

export default schedulerService; 