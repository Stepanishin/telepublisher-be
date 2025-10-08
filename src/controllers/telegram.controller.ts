import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/user.model';
import config from '../config/config';

// Telegram bot token from config
const BOT_TOKEN = config.telegramBotToken;

interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

// Verify Telegram login
export const verifyTelegramLogin = async (req: Request, res: Response): Promise<void> => {
  console.log('verifyTelegramLogin');
  try {
    const authData = req.body as TelegramAuthData;
    
    console.log('Auth data received:', JSON.stringify(authData, null, 2));
    
    // Check if required fields are present
    if (!authData.id || !authData.auth_date || !authData.hash) {
      res.status(400).json({
        success: false,
        message: 'Invalid Telegram login data',
      });
      return;
    }

    // Verify the authentication data
    if (!isValidTelegramAuth(authData)) {
      res.status(401).json({
        success: false,
        message: 'Telegram authentication failed',
      });
      return;
    }

    // Check if the auth_date is not too old (86400 seconds = 24 hours)
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - authData.auth_date > 86400) {
      res.status(401).json({
        success: false,
        message: 'Telegram authentication data is expired',
      });
      return;
    }

    // Find or create user
    let user = await User.findOne({ telegramId: authData.id.toString() });
    console.log('User found in DB:', user);
    
    if (!user) {
      console.log('Creating new user for Telegram ID:', authData.id);
      // Create new user with Telegram data
      user = new User({
        telegramId: authData.id.toString(),
        username: authData.username || `user_${authData.id}`,
        email: `${authData.id}@telegram.user`, // Placeholder email for Telegram users
        firstName: authData.first_name,
        lastName: authData.last_name || '',
        photoUrl: authData.photo_url || '',
      });
      
      await user.save();
      console.log('New user created:', user);
    } else {
      // Update existing user with latest Telegram data
      user.username = authData.username || user.username;
      user.firstName = authData.first_name;
      user.lastName = authData.last_name || user.lastName || '';
      user.photoUrl = authData.photo_url || user.photoUrl || '';
      
      await user.save();
      console.log('User updated:', user);
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id },
      config.jwtSecret,
      { expiresIn: '365d' } // Maximum expiration: 1 year for better UX
    );

    res.status(200).json({
      success: true,
      message: 'Telegram login successful',
      token,
      user: {
        id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
      },
    });
  } catch (error) {
    console.error('Telegram login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing Telegram login',
      error: (error as Error).message,
    });
  }
};

// Validate Telegram authentication data
function isValidTelegramAuth(authData: TelegramAuthData): boolean {
  // Create a data check string by sorting the received fields alphabetically
  const { hash, ...data } = authData;
  const dataCheckString = Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key as keyof typeof data]}`)
    .join('\n');

  console.log('Data check string:', dataCheckString);
  console.log('Bot token for validation:', BOT_TOKEN);

  // Create a secret key by hashing the bot token with SHA-256
  const secretKey = crypto
    .createHash('sha256')
    .update(BOT_TOKEN)
    .digest();

  // Calculate the HMAC-SHA-256 signature using the secret key
  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  console.log('Calculated HMAC:', hmac);
  console.log('Received hash:', hash);

  // Return true if the calculated HMAC signature matches the received hash
  return hmac === hash;
} 