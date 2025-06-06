import express, { Application, Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import config from './config/config';
import userRoutes from './routes/user.routes';
import telegramRoutes from './routes/telegram.routes';
import channelRoutes from './routes/channel.routes';
import creditRoutes from './routes/credit.routes';
import aiRoutes from './routes/ai.routes';
import stripeRoutes from './routes/stripe.routes';
import uploadRoutes from './routes/upload.routes';
import scheduledPostRoutes from './routes/scheduled-post.routes';
import scheduledPollRoutes from './routes/scheduled-poll.routes';
import draftRoutes from './routes/draft.routes';
import autoPostingRoutes from './routes/autoposting.routes';
import CreditService from './services/credit.service';
import schedulerService from './services/scheduler.service';
import path from 'path';

// Initialize express app
const app: Application = express();

if (config.nodeEnv === 'development') {
  // В разработке разрешаем все источники
  app.use(cors());
} else {
  // Replace with your Netlify domain
  const allowedOrigins = [
    'https://telepublisher.com',
    'https://www.telepublisher.com',
    'http://localhost:3000',
  ];
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
    })
  ); // CORS middleware should be early in the stack
  app.use(cors());
}

// IMPORTANT: Register the stripe routes BEFORE any body parsing middleware
// This is critical for webhook functionality
app.use('/api/stripe', stripeRoutes);

// Standard middleware for other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статический маршрут для загруженных файлов
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// All other routes (which use parsed JSON bodies)
app.use('/api/users', userRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/scheduled-posts', scheduledPostRoutes);
app.use('/api/scheduled-polls', scheduledPollRoutes);
app.use('/api/drafts', draftRoutes);
app.use('/api/autoposting', autoPostingRoutes);

// Default route
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    message: 'Telepublisher API is running',
  });
});

// Setup scheduler to run regularly
const setupScheduler = () => {
  // Check for expired subscriptions every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  const runScheduledTasks = async () => {
    try {
      console.log(
        'Running scheduled tasks - checking for subscription downgrades and expiries...'
      );
      const updatedCount = await CreditService.resetExpiredCredits();
      console.log(`Processed ${updatedCount} subscription(s)`);
    } catch (error) {
      console.error('Error in scheduled tasks:', error);
    }
  };

  // Run immediately on startup
  runScheduledTasks();

  // Schedule to run every 6 hours
  setInterval(runScheduledTasks, SIX_HOURS);

  // Start the scheduler for scheduled posts
  schedulerService.start();
};

// Connect to MongoDB and start server
const startServer = async (): Promise<void> => {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('Connected to MongoDB');

    const PORT = config.port;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} in ${config.nodeEnv} mode`);

      // Start the scheduler after server is up
      setupScheduler();
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
    process.exit(1);
  }
};

startServer();
