import { Request, Response, NextFunction } from 'express';

import { ApiError } from '@/utils/ApiError';
import { verifyAccessToken, AccessTokenPayload } from '@/services/token.service';

/**
 * Extend Express's Request type to include our user payload.
 * This gives TypeScript type safety when accessing req.user
 * in controllers and middleware.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload & { jti?: string };
    }
  }
}

/**
 * authenticate — middleware that protects routes requiring a valid session
 *
 * Reads the Bearer token from the Authorization header,
 * verifies it, and attaches the decoded payload to req.user.
 *
 * If the token is missing, expired, or invalid — returns 401.
 * If valid — calls next() and the route handler runs.
 *
 * Usage:
 *   router.post("/logout", authenticate, logout)
 *   router.get("/me", authenticate, getMe)
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  // Extract token from Authorization header
  // Expected format: "Bearer eyJhbGci..."
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('No token provided'));
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return next(ApiError.unauthorized('No token provided'));
  }

  // Verify the token — throws ApiError if invalid or expired
  const payload = verifyAccessToken(token);

  // Attach to request for downstream use
  req.user = payload;

  next();
};

/**
 * requireVerified — middleware that requires email verification
 *
 * Used on routes that should only be accessible to verified users.
 * Stack after authenticate:
 *   router.post("/sensitive-action", authenticate, requireVerified, handler)
 */
export const requireVerified = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user?.isVerified) {
    return next(ApiError.forbidden('Please verify your email to access this feature'));
  }
  next();
};
