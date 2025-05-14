import { Request, Response } from 'express';
import ScheduledPost from '../models/scheduled-post.model';
import { publishToTelegram } from '../services/telegram.service';
import User from '../models/user.model';

/**
 * Create a new scheduled post
 */
export const createScheduledPost = async (req: Request, res: Response) => {
  try {
    const { channelId, text, imageUrl, imageUrls, tags, scheduledDate } = req.body;
    const userId = req.user?._id;

    if (!channelId || !text || !scheduledDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: channelId, text, scheduledDate',
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

    // Validate that we have either a single image or multiple images, not both
    if (imageUrl && imageUrls && imageUrls.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot have both imageUrl and imageUrls. Use either single image or multiple images.',
      });
    }

    // Validate the number of images in imageUrls (Telegram limit is 10)
    if (imageUrls && imageUrls.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Telegram allows a maximum of 10 images in a single post',
      });
    }

    // Validate image URLs are valid
    const validateImageUrl = (url: string): boolean => {
      try {
        new URL(url); // This will throw if the URL is invalid
        return true;
      } catch (e) {
        return false;
      }
    };

    if (imageUrl && !validateImageUrl(imageUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image URL format',
      });
    }

    if (imageUrls && imageUrls.length > 0) {
      for (const url of imageUrls) {
        if (!validateImageUrl(url)) {
          return res.status(400).json({
            success: false,
            message: `Invalid image URL format in imageUrls: ${url}`,
          });
        }
      }
    }

    const scheduledPost = new ScheduledPost({
      channelId,
      text,
      imageUrl,
      imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
      tags,
      scheduledDate: scheduledDateObj,
      published: false,
      user: userId,
    });

    await scheduledPost.save();

    return res.status(201).json({
      success: true,
      message: 'Scheduled post created successfully',
      data: scheduledPost,
    });
  } catch (error) {
    console.error('Error creating scheduled post:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create scheduled post',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get all scheduled posts for a user
 */
export const getScheduledPosts = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const scheduledPosts = await ScheduledPost.find({ 
      user: userId,
      published: false,
      scheduledDate: { $gt: new Date() }
    }).sort({ scheduledDate: 1 });

    return res.status(200).json({
      success: true,
      posts: scheduledPosts,
    });
  } catch (error) {
    console.error('Error getting scheduled posts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get scheduled posts',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Delete a scheduled post
 */
export const deleteScheduledPost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    const scheduledPost = await ScheduledPost.findOneAndDelete({
      _id: id,
      user: userId,
      published: false,
    });

    if (!scheduledPost) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled post not found or already published',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Scheduled post deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting scheduled post:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete scheduled post',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Update a scheduled post
 */
export const updateScheduledPost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text, imageUrl, imageUrls, tags, scheduledDate } = req.body;
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

    const scheduledPost = await ScheduledPost.findOneAndUpdate(
      {
        _id: id,
        user: userId,
        published: false,
      },
      {
        ...(text && { text }),
        ...(imageUrl && { imageUrl }),
        ...(imageUrls && { imageUrls: Array.isArray(imageUrls) ? imageUrls : [] }),
        ...(tags && { tags }),
        ...(scheduledDate && { scheduledDate: new Date(scheduledDate) }),
      },
      { new: true }
    );

    if (!scheduledPost) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled post not found or already published',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Scheduled post updated successfully',
      data: scheduledPost,
    });
  } catch (error) {
    console.error('Error updating scheduled post:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update scheduled post',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Add new function for manual publishing
/**
 * Manually publish a scheduled post
 */
export const publishScheduledPost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    // Find the post
    const scheduledPost = await ScheduledPost.findOne({
      _id: id,
      user: userId,
      published: false,
    });

    if (!scheduledPost) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled post not found or already published',
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

    // Find the channel
    const channel = user.channels.find(c => {
      if (!c._id) return false;
      return c._id.toString() === scheduledPost.channelId.toString();
    });

    if (!channel || !channel.botToken) {
      return res.status(404).json({
        success: false,
        message: 'Channel not found or missing bot token',
      });
    }

    // Publish to Telegram
    const result = await publishToTelegram(
      channel.username,
      channel.botToken,
      scheduledPost.text,
      scheduledPost.imageUrl,
      scheduledPost.imageUrls,
      scheduledPost.tags
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: `Failed to publish: ${result.message}`,
      });
    }

    // Delete the post instead of marking as published
    await ScheduledPost.findByIdAndDelete(scheduledPost._id);

    return res.status(200).json({
      success: true,
      message: 'Post published and deleted successfully',
    });
  } catch (error) {
    console.error('Error publishing scheduled post:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to publish post',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get a single scheduled post by ID
 */
export const getScheduledPostById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    const scheduledPost = await ScheduledPost.findOne({
      _id: id,
      user: userId
    });

    if (!scheduledPost) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled post not found',
      });
    }

    return res.status(200).json({
      success: true,
      post: scheduledPost,
    });
  } catch (error) {
    console.error('Error getting scheduled post:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get scheduled post',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}; 