import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { redis } from '../config/redis';

/**
 * GET /health
 *
 * Checks three things:
 * 1. The API process itself is running (implied by the response)
 * 2. PostgreSQL is reachable and responding
 * 3. Redis is reachable and responding
 *
 * Returns 200 if everything is healthy
 * Returns 503 if any dependency is down
 */
export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  const health = {
    status: 'ok' as 'ok' | 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: 'ok' as 'ok' | 'error',
      redis: 'ok' as 'ok' | 'error',
    },
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV ?? 'development',
  };

  // ── Check PostgreSQL ─────────────────────────────────
  // $queryRaw sends a raw SQL query directly to the database
  // SELECT 1 is the lightest possible query — it does nothing
  // except confirm the connection is alive and responsive
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    health.services.database = 'error';
    health.status = 'degraded';
  }

  // ── Check Redis ──────────────────────────────────────
  // PING is Redis's built-in health command
  // A healthy Redis always responds with "PONG"
  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      health.services.redis = 'error';
      health.status = 'degraded';
    }
  } catch {
    health.services.redis = 'error';
    health.status = 'degraded';
  }

  // ── Respond ──────────────────────────────────────────
  // 503 = Service Unavailable (something is down)
  // 200 = Everything is healthy
  // This matters because monitoring tools read HTTP status codes,
  // not response bodies
  const statusCode = health.status === 'degraded' ? 503 : 200;
  res.status(statusCode).json(health);
};
