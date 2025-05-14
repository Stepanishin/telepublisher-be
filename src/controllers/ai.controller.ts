import { Request, Response } from 'express';
import OpenAI from 'openai';
import CreditService, { AI_OPERATION_COSTS } from '../services/credit.service';
import config from '../config/config';

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