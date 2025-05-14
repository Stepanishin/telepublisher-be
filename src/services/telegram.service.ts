import axios from 'axios';
import { IScheduledPost } from '../models/scheduled-post.model';
import fetch from 'node-fetch';

// Interface for Telegram API responses
interface TelegramResponse {
  ok: boolean;
  result?: any;
  description?: string;
  error_code?: number;
}

// Interface for media group items
interface MediaGroupItem {
  type: string;
  media: string;
  caption?: string;
  parse_mode?: string;
}

interface SendMessageParams {
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
}

interface SendPhotoParams {
  photo: string;
  caption?: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}

interface SendMediaGroupParams {
  media: {
    type: 'photo';
    media: string;
    caption?: string;
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  }[];
}

interface SendPollParams {
  question: string;
  options: string[];
  isAnonymous?: boolean;
  allowsMultipleAnswers?: boolean;
}

interface TelegramResult {
  success: boolean;
  message?: string;
  messageId?: number;
}

/**
 * Publish content to a Telegram channel
 */
export const publishToTelegram = async (
  channelId: string, 
  botToken: string, 
  text: string, 
  imageUrl?: string,
  imageUrls?: string[], 
  tags?: string[]
): Promise<{ success: boolean; message: string }> => {
  try {
    console.log(`Publishing to Telegram - channelId: ${channelId}, has image: ${!!imageUrl}, image count: ${imageUrls?.length || 0}`);
    
    // Prepare the chatId, adding @ if necessary
    let chatId = channelId;
    if (!chatId.startsWith('@') && !chatId.match(/^-?\d+$/)) {
      chatId = '@' + chatId;
    }
    
    // Prepare message text with tags if available
    let messageText = text;
    if (tags && tags.length > 0) {
      messageText += '\n\n' + tags.join(' ');
    }
    
    let response: TelegramResponse;
    
    // Check if we have multiple images
    if (imageUrls && imageUrls.length > 0) {
      console.log(`Sending ${imageUrls.length} images as a media group`);
      response = await sendMediaGroup(botToken, chatId, messageText, imageUrls);
    }
    // If there's a single image, send a photo with caption
    else if (imageUrl) {
      console.log(`Sending a single image with the photo endpoint`);
      response = await sendPhoto(botToken, chatId, messageText, imageUrl);
    } else {
      // Otherwise send just a text message
      console.log(`Sending a text-only message`);
      response = await sendMessage(botToken, chatId, messageText);
    }
    
    if (!response.ok) {
      const errorMessage = response.description || 'Unknown Telegram API error';
      console.error(`Telegram API error: ${errorMessage} (Code: ${response.error_code})`);
      throw new Error(errorMessage);
    }
    
    console.log(`Successfully published to Telegram channel: ${chatId}`);
    return {
      success: true,
      message: 'Successfully published to Telegram'
    };
  } catch (error) {
    console.error('Error publishing to Telegram:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to publish to Telegram';
    return {
      success: false,
      message: errorMessage
    };
  }
};

/**
 * Send a text message to a Telegram chat
 */
const sendMessage = async (
  botToken: string, 
  chatId: string, 
  text: string
): Promise<TelegramResponse> => {
  const response = await axios.post<TelegramResponse>(
    `https://api.telegram.org/bot${botToken}/sendMessage`, 
    {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    }
  );
  
  return response.data;
};

/**
 * Send a photo with caption to a Telegram chat
 */
const sendPhoto = async (
  botToken: string, 
  chatId: string, 
  caption: string, 
  photoUrl: string
): Promise<TelegramResponse> => {
  const response = await axios.post<TelegramResponse>(
    `https://api.telegram.org/bot${botToken}/sendPhoto`, 
    {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: 'HTML'
    }
  );
  
  return response.data;
};

/**
 * Send multiple photos as a media group to a Telegram chat
 */
const sendMediaGroup = async (
  botToken: string,
  chatId: string,
  caption: string,
  photoUrls: string[]
): Promise<TelegramResponse> => {
  // Create media array
  const media: MediaGroupItem[] = photoUrls.map((url, index) => ({
    type: 'photo',
    media: url,
    // Only add caption to the first media item
    ...(index === 0 && {
      caption,
      parse_mode: 'HTML'
    })
  }));

  const response = await axios.post<TelegramResponse>(
    `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
    {
      chat_id: chatId,
      media: media
    }
  );

  return response.data;
};

export class TelegramService {
  private token: string;
  private apiUrl: string;

  constructor(token: string) {
    this.token = token;
    this.apiUrl = `https://api.telegram.org/bot${token}`;
  }

  /**
   * Send a text message to a Telegram chat
   */
  async sendMessage(chatId: string, params: SendMessageParams): Promise<TelegramResult> {
    try {
      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: params.text,
          parse_mode: params.parse_mode || 'HTML',
          disable_web_page_preview: params.disable_web_page_preview
        })
      });

      const data = await response.json() as any;

      if (!data.ok) {
        return {
          success: false,
          message: data.description || 'Error sending message'
        };
      }

      return {
        success: true,
        messageId: data.result.message_id
      };
    } catch (error) {
      console.error('Error sending Telegram message:', error);
      return {
        success: false,
        message: (error as Error).message
      };
    }
  }

  /**
   * Send a photo to a Telegram chat
   */
  async sendPhoto(chatId: string, params: SendPhotoParams): Promise<TelegramResult> {
    try {
      const response = await fetch(`${this.apiUrl}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: params.photo,
          caption: params.caption,
          parse_mode: params.parse_mode || 'HTML'
        })
      });

      const data = await response.json() as any;

      if (!data.ok) {
        return {
          success: false,
          message: data.description || 'Error sending photo'
        };
      }

      return {
        success: true,
        messageId: data.result.message_id
      };
    } catch (error) {
      console.error('Error sending Telegram photo:', error);
      return {
        success: false,
        message: (error as Error).message
      };
    }
  }

  /**
   * Send a media group (album) to a Telegram chat
   */
  async sendMediaGroup(chatId: string, params: SendMediaGroupParams): Promise<TelegramResult> {
    try {
      const mediaWithDefaultParseMode = params.media.map(item => ({
        ...item,
        parse_mode: item.parse_mode || 'HTML'
      }));

      const response = await fetch(`${this.apiUrl}/sendMediaGroup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          media: mediaWithDefaultParseMode
        })
      });

      const data = await response.json() as any;

      if (!data.ok) {
        return {
          success: false,
          message: data.description || 'Error sending media group'
        };
      }

      return {
        success: true,
        messageId: data.result[0].message_id
      };
    } catch (error) {
      console.error('Error sending Telegram media group:', error);
      return {
        success: false,
        message: (error as Error).message
      };
    }
  }

  /**
   * Send a poll to a Telegram chat
   */
  async sendPoll(chatId: string, params: SendPollParams): Promise<TelegramResult> {
    try {
      const response = await fetch(`${this.apiUrl}/sendPoll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          question: params.question,
          options: params.options,
          is_anonymous: params.isAnonymous !== undefined ? params.isAnonymous : true,
          allows_multiple_answers: params.allowsMultipleAnswers !== undefined ? params.allowsMultipleAnswers : false
        })
      });

      const data = await response.json() as any;

      if (!data.ok) {
        return {
          success: false,
          message: data.description || 'Error sending poll'
        };
      }

      return {
        success: true,
        messageId: data.result.message_id
      };
    } catch (error) {
      console.error('Error sending Telegram poll:', error);
      return {
        success: false,
        message: (error as Error).message
      };
    }
  }
} 