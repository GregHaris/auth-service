import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env';
import { prisma } from './config/db';
import { redis } from './config/redis';

import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.route';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// ── Global Middleware ────────────────────────────────
// Order matters here. Security headers first, then parsing.

app.use(helmet());
// helmet() sets ~15 security-related HTTP headers automatically
// e.g. X-Content-Type-Options, X-Frame-Options, etc.
// Always first so every response gets these headers

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    // credentials: true is REQUIRED for cookies to work cross-origin
    // Without this, the browser silently drops Set-Cookie headers
  }),
);

app.use(morgan('dev'));
// morgan logs every request: METHOD URL STATUS TIME
// "dev" format is colorized and concise — good for development

app.use(express.json());
// Parses incoming JSON bodies — req.body becomes usable
// Without this, req.body is undefined for POST/PUT requests

app.use(express.urlencoded({ extended: true }));
// Parses form-encoded bodies (HTML form submissions)
// extended: true allows nested objects in form data

app.use(cookieParser());
// Parses Cookie header and populates req.cookies
// REQUIRED for reading your httpOnly refresh token cookie

// ── Routes ───────────────────────────────────────────
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);

app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
  });
});

app.use(errorHandler);

async function start() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    await redis.connect();

    app.listen(env.PORT, () => {
      console.log(`✅ Server running → http://localhost:${env.PORT}`);
      console.log(`📋 Health check → http://localhost:${env.PORT}/health`);
    });
  } catch (err) {
    console.error('❌ Failed to start:', err);
    process.exit(1);
    // process.exit(1) signals to Docker/pm2/systemd that
    // the process crashed — triggers restart policies
  }
}

start();
