import { Request, Response } from 'express';
import OpenAI from 'openai';
import CreditService, { AI_OPERATION_COSTS } from '../services/credit.service';
import config from '../config/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

export const generateText = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ 
        success: false, 
        message: 'Prompt is required' 
      });
    }

    // Check if user has enough credits
    const operationCost = AI_OPERATION_COSTS.TEXT_GENERATION_GPT35;
    const hasEnoughCredits = await CreditService.hasEnoughCredits(userId, operationCost);
    
    if (!hasEnoughCredits) {
      return res.status(403).json({
        success: false,
        message: 'Not enough credits to generate text'
      });
    }

    // Generate text with OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "You are an assistant who creates content for Telegram channels. Your task is to create interesting, informative posts of 200-300 words." 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    // Use credits
    await CreditService.useCredits(userId, operationCost);

    // Get the generated text
    const generatedText = response.choices[0].message.content;

    return res.status(200).json({
      success: true,
      data: {
        text: generatedText
      }
    });
  } catch (error: unknown) {
    console.error('Error generating text:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при генерации текста';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
}; 

export const generateTextFromImage = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { imageUrl, additionalPrompt } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'Image URL is required' 
      });
    }

    // Check if user has enough credits - this costs more because it uses Vision API
    const operationCost = AI_OPERATION_COSTS.TEXT_FROM_IMAGE;
    const hasEnoughCredits = await CreditService.hasEnoughCredits(userId, operationCost);
    
    if (!hasEnoughCredits) {
      return res.status(403).json({
        success: false,
        message: 'Not enough credits to generate text from image'
      });
    }

    // Скачиваем изображение, если URL локальный
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axios = require('axios');
    let accessibleImageUrl = imageUrl;
    
    // Проверяем, является ли URL локальным
    if (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')) {
      console.log('Local URL detected, downloading image and converting to base64...');
      try {
        // Скачиваем изображение
        const imageResponse = await axios({
          method: 'get',
          url: imageUrl,
          responseType: 'arraybuffer'
        });
        
        // Конвертируем в base64
        const base64Image = Buffer.from(imageResponse.data).toString('base64');
        // Определяем MIME-тип по первым байтам (сигнатуре файла)
        const fileSignature = Buffer.from(imageResponse.data.slice(0, 4)).toString('hex');
        let mimeType = 'image/jpeg'; // по умолчанию
        
        if (fileSignature.startsWith('89504e47')) {
          mimeType = 'image/png';
        } else if (fileSignature.startsWith('ffd8ff')) {
          mimeType = 'image/jpeg';
        } else if (fileSignature.startsWith('47494638')) {
          mimeType = 'image/gif';
        }
        
        // Создаем data URL для использования в API
        accessibleImageUrl = `data:${mimeType};base64,${base64Image}`;
        console.log('Image converted to base64 data URL');
      } catch (downloadError) {
        console.error('Error downloading local image:', downloadError);
        return res.status(400).json({
          success: false,
          message: 'Error accessing local image. Please provide a publicly accessible URL.'
        });
      }
    }

    // Prepare the prompt with image
    const basePrompt = "Create a descriptive and engaging Telegram post based on this image.";
    const userPrompt = additionalPrompt ? `${additionalPrompt}` : basePrompt;

    // Generate text with OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "You are an assistant who creates content for Telegram channels. Your task is to analyze images and create interesting, informative posts of 200-300 words based on them." 
        },
        { 
          role: "user", 
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: accessibleImageUrl } }
          ]
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    // Use credits
    await CreditService.useCredits(userId, operationCost);

    // Get the generated text
    const generatedText = response.choices[0].message.content;

    return res.status(200).json({
      success: true,
      data: {
        text: generatedText
      }
    });
  } catch (error: unknown) {
    console.error('Error generating text from image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при генерации текста по изображению';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const generateImageFromImage = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { imageUrl, prompt } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'Image URL is required' 
      });
    }

    // Check if user has enough credits
    const operationCost = AI_OPERATION_COSTS.IMAGE_FROM_IMAGE;
    const hasEnoughCredits = await CreditService.hasEnoughCredits(userId, operationCost);
    
    if (!hasEnoughCredits) {
      return res.status(403).json({
        success: false,
        message: 'Not enough credits to generate image from reference'
      });
    }

    try {
      console.log('Processing image from URL:', imageUrl);
      
      // Базовый промпт или пользовательский
      const userPrompt = prompt || "Create a variation of this image that would be suitable for a Telegram post.";
      
      // Скачиваем изображение, если URL локальный
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const axios = require('axios');
      let accessibleImageUrl = imageUrl;
      
      // Проверяем, является ли URL локальным
      if (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')) {
        console.log('Local URL detected, downloading image and converting to base64...');
        try {
          // Скачиваем изображение
          const imageResponse = await axios({
            method: 'get',
            url: imageUrl,
            responseType: 'arraybuffer'
          });
          
          // Конвертируем в base64
          const base64Image = Buffer.from(imageResponse.data).toString('base64');
          // Определяем MIME-тип по первым байтам (сигнатуре файла)
          const fileSignature = Buffer.from(imageResponse.data.slice(0, 4)).toString('hex');
          let mimeType = 'image/jpeg'; // по умолчанию
          
          if (fileSignature.startsWith('89504e47')) {
            mimeType = 'image/png';
          } else if (fileSignature.startsWith('ffd8ff')) {
            mimeType = 'image/jpeg';
          } else if (fileSignature.startsWith('47494638')) {
            mimeType = 'image/gif';
          }
          
          // Создаем data URL для использования в API
          accessibleImageUrl = `data:${mimeType};base64,${base64Image}`;
          console.log('Image converted to base64 data URL');
        } catch (downloadError) {
          console.error('Error downloading local image:', downloadError);
          return res.status(400).json({
            success: false,
            message: 'Error accessing local image. Please provide a publicly accessible URL.'
          });
        }
      }
      
      // Шаг 1: Анализ изображения через GPT-4V
      console.log('Analyzing image with GPT-4V...');
      const analysisResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: "Analyze the image in detail and create a thorough description that captures all visual elements, colors, composition, style, and mood. This description will be used to recreate a variation of this image with DALL-E 3." 
          },
          { 
            role: "user", 
            content: [
              { type: "text", text: "Analyze this image in detail. Focus on all visual elements, style, composition, and aesthetic qualities." },
              { type: "image_url", image_url: { url: accessibleImageUrl } }
            ]
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });
      
      // Получаем детальное описание изображения
      const imageDescription = analysisResponse.choices[0].message.content || '';
      console.log('Image analysis complete');
      
      // Шаг 2: Создаем новый промпт для DALL-E 3, комбинируя описание и запрос пользователя
      const enhancedPrompt = `${userPrompt}\n\nReference image details: ${imageDescription} \n\n The image should be in the style of the reference image including ${userPrompt}`;
      console.log('Generated enhanced prompt for DALL-E 3');

      console.log('Enhanced prompt:', enhancedPrompt);
      
      // Шаг 3: Генерируем новое изображение с DALL-E 3
      console.log('Calling DALL-E 3 to generate new image...');
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: enhancedPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url"
      });
      
      // Используем кредиты
      await CreditService.useCredits(userId, operationCost);
      
      // Получаем URL сгенерированного изображения
      const generatedImageUrl = response.data?.[0]?.url || '';
      
      if (!generatedImageUrl) {
        throw new Error('Error getting image URL');
      }
      
      console.log('Successfully generated image with DALL-E 3');
      
      return res.status(200).json({
        success: true,
        data: {
          imageUrl: generatedImageUrl
        }
      });
    } catch (err) {
      console.error('Image processing error:', err);
      
      // Check for specific OpenAI errors
      if (err instanceof Error) {
        // Size or content policy errors
        if (err.message.includes('size') || 
            err.message.includes('too large') ||
            err.message.includes('policy') ||
            err.message.includes('content')) {
          return res.status(400).json({
            success: false,
            message: err.message
          });
        }
      }
      
      throw err;
    }
  } catch (error: unknown) {
    console.error('Error generating image from reference:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error generating image from reference';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const generateTags = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ 
        success: false, 
        message: 'Text is required' 
      });
    }

    // Check if user has enough credits
    const operationCost = AI_OPERATION_COSTS.TEXT_GENERATION_GPT35;
    const hasEnoughCredits = await CreditService.hasEnoughCredits(userId, operationCost);
    
    if (!hasEnoughCredits) {
      return res.status(403).json({
        success: false,
        message: 'Not enough credits to generate tags'
      });
    }

    // Generate tags with OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { 
          role: "system", 
          content: `You are an assistant who generates hashtags for posts in Telegram.
Your task is to select 5-7 key topics from the text and create suitable and short 1-word hashtags for them.
Return only a list of hashtags separated by commas.` 
        },
        { 
          role: "user", 
          content: text 
        }
      ],
      temperature: 0.7,
      max_tokens: 100
    });

    // Use credits
    await CreditService.useCredits(userId, operationCost);

    // Parse the generated tags
    const rawTags = response.choices[0].message.content?.trim() || '';
    const tags = rawTags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
      .map(tag => tag.startsWith('#') ? tag.slice(1) : tag);

    return res.status(200).json({
      success: true,
      data: {
        tags
      }
    });
  } catch (error: unknown) {
    console.error('Error generating tags:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при генерации тегов';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
}; 

export const generateImage = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ 
        success: false, 
        message: 'Prompt is required' 
      });
    }

    // Check if user has enough credits
    const operationCost = AI_OPERATION_COSTS.IMAGE_GENERATION_BASIC;
    const hasEnoughCredits = await CreditService.hasEnoughCredits(userId, operationCost);
    
    if (!hasEnoughCredits) {
      return res.status(403).json({
        success: false,
        message: 'Not enough credits to generate image'
      });
    }

    // Generate image with DALL-E
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024", // другие опции: "1024x1024", "1792x1024", "1024x1792"
     quality: "standard", // или "hd" (только для dall-e-3),
      response_format: "url"
    });

    // Use credits
    await CreditService.useCredits(userId, operationCost);

    // Get the generated image URL
    const imageUrl = response.data?.[0]?.url || '';
    
    if (!imageUrl) {
      throw new Error('Ошибка при получении URL изображения');
    }

    return res.status(200).json({
      success: true,
      data: {
        imageUrl
      }
    });
  } catch (error: unknown) {
    console.error('Error generating image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ошибка при генерации изображения';
    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
}; 