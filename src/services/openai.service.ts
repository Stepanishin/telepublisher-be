import axios from 'axios';
import config from '../config/config';
import CreditService from './credit.service';

// Initialize OpenAI API client
const openaiApiKey = config.openaiApiKey;

/**
 * Generate text using OpenAI API
 */
export const generateText = async (prompt: string): Promise<string> => {
  try {
    // Generate a random number to vary style and approach
    const randomStyle = Math.floor(Math.random() * 5); // 0-4
    
    // Create different system prompts for variety
    const systemPrompts = [
      'You are a creative content writer for Telegram channels. Create unique, engaging content with a casual, conversational tone. Vary your writing style, structure, and pacing. Include unexpected insights or perspectives. Keep responses under 1000 characters.',
      'You are a Telegram channel content expert specializing in concise, bold statements. Mix short and long sentences for rhythm. Use analogies, metaphors or unexpected comparisons. Break conventional writing patterns. Keep responses under 1000 characters.',
      'You are a viral content creator for Telegram. Craft punchy, attention-grabbing posts. Start with surprising facts or questions. Vary between authoritative, curious, and excited tones. Create content that feels fresh and different from previous posts. Keep responses under 1000 characters.',
      'You are a social media specialist writing for Telegram. Develop content with personality and unique perspectives. Occasionally use emojis strategically. Vary paragraph length and sentence structure. Find unusual angles on familiar topics. Keep responses under 1000 characters.',
      'You are an innovative Telegram content strategist. Mix informative and provocative styles. Create content that surprises the reader with unexpected twists or insights. Vary between formal and informal language. Develop a distinctive voice. Keep responses under 1000 characters.'
    ];
    
    // Choose system prompt based on random number
    const systemPrompt = systemPrompts[randomStyle];
    
    // Create a variation of the user prompt by adding random modifiers
    const modifiers = [
      'Approach this from an unexpected angle.',
      'Include a surprising fact or perspective.',
      'Add a touch of humor or personality.',
      'Structure this in an unconventional way.',
      'Mix different tones and styles in this piece.',
      'Include a creative analogy or metaphor.',
      'Start with something attention-grabbing.',
      'Make this feel different from typical content on this topic.'
    ];
    
    // Randomly select 1-2 modifiers
    const numModifiers = Math.floor(Math.random() * 2) + 1;
    const selectedModifiers = [];
    for (let i = 0; i < numModifiers; i++) {
      const randomIndex = Math.floor(Math.random() * modifiers.length);
      selectedModifiers.push(modifiers[randomIndex]);
      modifiers.splice(randomIndex, 1); // Remove selected modifier to avoid duplicates
    }
    
    // Construct enhanced prompt
    const enhancedPrompt = `${prompt} ${selectedModifiers.join(' ')}`;
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: enhancedPrompt }
        ],
        max_tokens: 600,
        temperature: 0.85, // Higher temperature for more randomness and creativity
        top_p: 0.95, // Slightly increase diversity of token selection
        frequency_penalty: 0.5, // Reduce repetition of phrases
        presence_penalty: 0.5 // Encourage new topics
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating text with OpenAI:', error);
    throw new Error('Failed to generate text content');
  }
};

/**
 * Generate an image using OpenAI API
 */
export const generateImage = async (prompt: string): Promise<string> => {
  try {
    console.log(`[OPENAI SERVICE] Generating image with prompt: "${prompt.substring(0, 100)}..."`);
    
    // Initialize OpenAI client
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });
    
    // Create diverse image styles
    const imageStyles = [
      'photorealistic, high detail, 8k resolution, professional photography',
      'vibrant digital art, colorful, trendy, modern design',
      'minimalist illustration, clean lines, simple color palette',
      'dramatic lighting, cinematic composition, movie scene quality',
      'retro style, vintage aesthetic, nostalgic feel',
      'futuristic, sci-fi inspired, high-tech visualization',
      'artistic, painterly style, expressive brushstrokes',
      'isometric design, 3D perspective, detailed small elements',
      'abstract conceptual art, symbolic representation',
      'pop art style, bold colors, graphic design elements'
    ];
    
    // Randomly select an image style
    const randomStyle = imageStyles[Math.floor(Math.random() * imageStyles.length)];
    
    // Add random perspective/composition
    const perspectives = [
      'close-up view', 'wide angle shot', 'overhead perspective', 
      'side view', 'dramatic angle', 'symmetrical composition',
      'asymmetrical balance', 'macro detail', 'panoramic view'
    ];
    
    const randomPerspective = perspectives[Math.floor(Math.random() * perspectives.length)];
    
    // Enhanced prompt with style and perspective
    const enhancedPrompt = `${prompt}, ${randomStyle}, ${randomPerspective}`;
    
    console.log(`[OPENAI SERVICE] Enhanced image prompt: "${enhancedPrompt.substring(0, 100)}..."`);
    
    // Generate image with DALL-E using the OpenAI client
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: enhancedPrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "url"
    });

    // Extract the generated image URL from the response
    const imageUrl = response.data?.[0]?.url || '';
    
    console.log(`[OPENAI SERVICE] Generated image URL: ${imageUrl}`);
    
    if (!imageUrl) {
      throw new Error('Error getting image URL');
    }
    
    // Проверяем валидность URL
    try {
      new URL(imageUrl);
      console.log(`[OPENAI SERVICE] Image URL is valid`);
    } catch (e) {
      console.error(`[OPENAI SERVICE] Invalid image URL format: ${imageUrl}`);
      throw new Error('Invalid image URL format');
    }

    return imageUrl;
  } catch (error) {
    console.error('Error generating image with OpenAI:', error);
    throw new Error('Failed to generate image');
  }
}; 