import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

/**
 * Global error handling middleware
 *
 * Must be registered LAST in Express — after all routes and middleware.
 * Express identifies it as an error handler by its 4-parameter signature.
 *
 * Handles two categories of errors:
 *
 * 1. ApiError (operational) — thrown intentionally by your code
 *    → Formats and sends the error as a clean JSON response
 *
 * 2. Everything else (unexpected) — bugs, library errors, etc.
 *    → Logs the full error, sends a generic 500 response
 *    → Never exposes internal error details to the client in production
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // ── Operational Error (ApiError) ─────────────────────
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      // Include field-level errors if present (validation failures)
      ...(err.errors && { errors: err.errors }),
    });
    return;
  }

  // ── Unexpected Error ─────────────────────────────────
  // Always log the full error server-side — you need the stack trace
  // to debug. But never send internal details to the client.
  console.error('Unhandled error:', err);

  // In development, send the stack trace so you can debug quickly
  // In production, send a generic message — never expose internals
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong',
    ...(env.NODE_ENV === 'development' && {
      debug: err.message,
      stack: err.stack,
    }),
  });
};
