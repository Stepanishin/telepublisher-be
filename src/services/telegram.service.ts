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
  tags?: string[],
  imagePosition: 'top' | 'bottom' = 'top',
  buttons?: { text: string; url: string }[]
): Promise<{ success: boolean; message: string }> => {
  try {
    const startTime = Date.now();
    console.log(`[TELEGRAM SERVICE] Publishing to Telegram - channelId: ${channelId}, has image: ${!!imageUrl}, image count: ${imageUrls?.length || 0}, imagePosition: ${imagePosition}, buttons: ${buttons?.length || 0}`);
    console.log(`[TELEGRAM SERVICE] Text length: ${text.length}, Text: ${text.substring(0, 50)}...`);
    console.log(`[TELEGRAM SERVICE] Images: ${imageUrl || 'none'}, ${imageUrls && imageUrls.length > 0 ? JSON.stringify(imageUrls) : 'none'}`);
    console.log(`[TELEGRAM SERVICE] Position: ${imagePosition}, Buttons: ${buttons ? JSON.stringify(buttons) : 'none'}`);
    
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
    
    // Prepare inline keyboard if buttons are provided
    const replyMarkup = buttons && buttons.length > 0 
      ? {
          inline_keyboard: buttons.map(button => [{
            text: button.text,
            url: button.url
          }])
        }
      : undefined;
    
    let response: TelegramResponse;
    
    // Check if we have multiple images
    if (imageUrls && imageUrls.length > 0) {
      console.log(`[TELEGRAM SERVICE] Sending ${imageUrls.length} images as a media group`);
      
      // Для позиции 'bottom', отправляем текстовое сообщение с предпросмотром первого изображения
      if (imagePosition === 'bottom' && messageText.trim()) {
        console.log(`[TELEGRAM SERVICE] Using bottom position with message preview for multiple images`);
        // Берем первое изображение для предпросмотра
        const previewImageUrl = imageUrls[0];
        
        // Отправляем текстовое сообщение с предпросмотром изображения внизу
        response = await sendMessageWithPreview(botToken, chatId, messageText, previewImageUrl, replyMarkup);
      } else {
        console.log(`[TELEGRAM SERVICE] Using standard media group sending for multiple images`);
        // Отправляем группу изображений с стандартным способом
        response = await sendMediaGroup(botToken, chatId, messageText, imageUrls);
        
        // Если есть кнопки, отправляем их отдельным сообщением
        if (replyMarkup) {
          console.log(`[TELEGRAM SERVICE] Sending buttons separately for media group`);
          await sendMessage(botToken, chatId, '🔗 Links:', replyMarkup);
        }
      }
    }
    // If there's a single image
    else if (imageUrl) {
      console.log(`[TELEGRAM SERVICE] Sending a single image with position: ${imagePosition}`);
      
      // For bottom image position, send a message with image preview at bottom
      if (imagePosition === 'bottom' && messageText.trim()) {
        console.log(`[TELEGRAM SERVICE] Using bottom position with message preview for single image`);
        // Create message with image link preview
        response = await sendMessageWithPreview(botToken, chatId, messageText, imageUrl, replyMarkup);
      } else {
        console.log(`[TELEGRAM SERVICE] Using standard photo with caption for single image`);
        // Regular behavior - image with caption
        response = await sendPhoto(botToken, chatId, messageText, imageUrl, replyMarkup);
      }
    } else {
      // Otherwise send just a text message
      console.log(`[TELEGRAM SERVICE] Sending a text-only message`);
      response = await sendMessage(botToken, chatId, messageText, replyMarkup);
    }
    
    if (!response.ok) {
      const errorMessage = response.description || 'Unknown Telegram API error';
      console.error(`[TELEGRAM SERVICE] Telegram API error: ${errorMessage} (Code: ${response.error_code})`);
      throw new Error(errorMessage);
    }
    
    console.log(`[TELEGRAM SERVICE] Successfully published to Telegram channel: ${chatId}`);
    console.log(`[TELEGRAM SERVICE] Total publication time: ${Date.now() - startTime}ms`);
    return {
      success: true,
      message: 'Successfully published to Telegram'
    };
  } catch (error) {
    console.error('[TELEGRAM SERVICE] Error publishing to Telegram:', error);
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
  text: string,
  replyMarkup?: any
): Promise<TelegramResponse> => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    })
  });
  
  return await response.json();
};

/**
 * Send a photo with caption to a Telegram chat
 */
const sendPhoto = async (
  botToken: string,
  chatId: string,
  caption: string,
  photoUrl: string,
  replyMarkup?: any
): Promise<TelegramResponse> => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    })
  });

  return await response.json();
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

// Вспомогательная функция для отправки сообщения с превью изображения внизу
const sendMessageWithPreview = async (
  botToken: string,
  chatId: string,
  text: string,
  imageUrl: string,
  replyMarkup?: any
): Promise<TelegramResponse> => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      link_preview_options: {
        is_disabled: false,
        url: imageUrl,
        prefer_large_media: true,
        show_above_text: false
      },
      reply_markup: replyMarkup
    })
  });
  
  return await response.json();
};

/**
 * Publish to a Telegram channel using bot token and channel username
 */
export const publishToChannel = async (params: {
  channelUsername: string;
  botToken: string;
  text: string;
  imageUrl?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    // Prepare chatId
    let chatId = params.channelUsername;
    if (!chatId.startsWith('@') && !chatId.match(/^-?\d+$/)) {
      chatId = '@' + chatId;
    }
    
    let response: TelegramResponse;
    
    // If there's an image, handle potential caption length limit (1024 chars for Telegram)
    if (params.imageUrl) {
      const MAX_CAPTION_LENGTH = 1000; // Slightly less than the actual limit for safety
      
      if (params.text.length > MAX_CAPTION_LENGTH) {
        // First send the image with a shortened caption
        const caption = params.text.substring(0, MAX_CAPTION_LENGTH) + "...";
        response = await sendPhoto(
          params.botToken,
          chatId,
          caption,
          params.imageUrl
        );
        
        // Then send the full text as a separate message
        await sendMessage(
          params.botToken,
          chatId,
          params.text
        );
      } else {
        // Text is short enough to fit in caption
        response = await sendPhoto(
          params.botToken,
          chatId,
          params.text,
          params.imageUrl
        );
      }
    } else {
      // Otherwise just send a text message
      response = await sendMessage(
        params.botToken,
        chatId,
        params.text
      );
    }
    
    if (!response.ok) {
      const errorMessage = response.description || 'Unknown Telegram API error';
      throw new Error(errorMessage);
    }
    
    return {
      success: true,
      messageId: response.result.message_id.toString()
    };
  } catch (error) {
    console.error('Error publishing to Telegram channel:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to publish to Telegram'
    };
  }
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