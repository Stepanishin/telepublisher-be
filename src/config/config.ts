import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const config = {
  port: process.env.PORT || 5000,
  mongodbUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  stripe: {
    publishableKey: process.env.NODE_ENV === 'production' 
      ? process.env.STRIPE_PUBLISHABLE_KEY || ''
      : process.env.STRIPE_PUBLISHABLE_KEY_TEST || '',
    secretKey: process.env.NODE_ENV === 'production'
      ? process.env.STRIPE_SECRET_KEY || ''
      : process.env.STRIPE_SECRET_KEY_TEST || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
};

export default config; 