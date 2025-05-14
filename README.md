# Telepublisher Backend

Backend server for the Telepublisher application built with Node.js, Express, and MongoDB.

## Technologies Used

- Node.js
- Express
- TypeScript
- MongoDB with Mongoose
- JWT for authentication
- bcrypt for password hashing
- Telegram Login Authentication

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the root of the server directory with the following variables:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/telepublisher
JWT_SECRET=your_jwt_secret_key_change_in_production
NODE_ENV=development
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

3. Make sure MongoDB is running on your system

## Telegram Login Setup

1. Create a Telegram bot via [BotFather](https://t.me/botfather)
2. Get your bot token from BotFather and add it to your .env file
3. Configure your bot for login:
   - Send `/setdomain` to BotFather
   - Select your bot
   - Enter your domain (e.g., example.com)
4. In your React application, use the Telegram Login Widget with your bot name

## Development

Start the development server:

```bash
npm run dev
```

The server will run on `http://localhost:5000` by default (or the PORT specified in your .env file).

## Build and Production

Build the TypeScript project:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## API Endpoints

### User Routes

- `POST /api/users/register` - Register a new user
  - Body: `{ username, email, password }`

- `POST /api/users/login` - Login a user
  - Body: `{ email, password }`

- `GET /api/users/me` - Get current user (requires authentication)
  - Headers: `Authorization: Bearer YOUR_JWT_TOKEN`

### Telegram Routes

- `POST /api/telegram/auth` - Authenticate with Telegram
  - Body: Telegram authentication data

## Authentication

The API uses JWT (JSON Web Token) for authentication. Protected routes require an Authorization header with a valid JWT token:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

The token is obtained when registering, logging in, or authenticating with Telegram. 