import jwt, { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

export interface AccessTokenPayload {
  userId: string;
  email: string;
  isVerified: boolean;
}

/**
 * What we embed inside the refresh token payload.
 *
 * jti = JWT ID — a unique identifier for this specific token.
 * This is what we store in Redis. When the user logs out,
 * we delete this jti from Redis. The next refresh attempt
 * finds no matching jti and is rejected.
 */
export interface RefreshTokenPayload {
  userId: string;
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ── Redis key helpers ────────────────────────────────
// Centralise key construction so there's no typo risk
// when reading/writing/deleting from Redis

const refreshTokenKey = (userId: string, jti: string) => `refresh_token:${userId}:${jti}`;

const userTokensPattern = (userId: string) => `refresh_token:${userId}:*`;

// ── Token generation ─────────────────────────────────

/**
 * signAccessToken — creates a short-lived JWT for API authentication
 *
 * This token is:
 * - Stateless: verified by signature alone, no DB or Redis lookup
 * - Short-lived: expires in 15 minutes by default
 * - Sent in the Authorization header: "Bearer <token>"
 * - Stored in memory on the client (never in localStorage)
 *
 * Because it's stateless, it CANNOT be revoked before expiry.
 * This is why it's short-lived — if stolen, the attacker has
 * at most 15 minutes before it's useless.
 */
export const signAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET as string, {
    expiresIn: (env.ACCESS_TOKEN_EXPIRES_IN as SignOptions['expiresIn']) ?? '15m',
    algorithm: 'HS256',
  });
};

/**
 * signRefreshToken — creates a long-lived JWT for token rotation
 *
 * This token is:
 * - Stateful: the jti must exist in Redis to be valid
 * - Long-lived: expires in 7 days by default
 * - Sent as an httpOnly cookie (invisible to JavaScript)
 * - Stored in Redis with TTL matching the token expiry
 *
 * Because it's stateful (Redis), it CAN be revoked instantly.
 * Logout = delete the jti from Redis.
 * The token itself may still be cryptographically valid, but
 * Redis will reject it.
 */

export const signRefreshToken = async (userId: string): Promise<string> => {
  const jti = uuidv4();
  const payload: RefreshTokenPayload = { userId, jti };

  const token = jwt.sign(payload, env.REFRESH_TOKEN_SECRET as string, {
    expiresIn: (env.REFRESH_TOKEN_EXPIRES_IN as SignOptions['expiresIn']) ?? '7d',
    algorithm: 'HS256',
  });

  // Store the jti in Redis with the same TTL as the token
  // Value is the userId — useful for looking up who owns this token
  // 7 days in seconds = 604800
  const ttlSeconds = 7 * 24 * 60 * 60;
  await redis.set(refreshTokenKey(userId, jti), userId, 'EX', ttlSeconds);

  return token;
};

/**
 * generateTokenPair — convenience function that creates both tokens
 *
 * Called after successful login, registration, or token refresh.
 * Returns both tokens so the controller can:
 * - Send the access token in the response body
 * - Set the refresh token as an httpOnly cookie
 */
export const generateTokenPair = async (payload: AccessTokenPayload): Promise<TokenPair> => {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(payload),
    signRefreshToken(payload.userId),
  ]);

  return { accessToken, refreshToken };
};

// ── Token verification ───────────────────────────────

/**
 * verifyAccessToken — validates an access token's signature and expiry
 *
 * Throws if:
 * - Signature is invalid (token was tampered with)
 * - Token has expired
 * - Token is malformed
 *
 * Does NOT check Redis — access tokens are stateless.
 */
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    return jwt.verify(token, env.ACCESS_TOKEN_SECRET as string) as AccessTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Access token expired');
    }
    throw ApiError.unauthorized('Invalid access token');
  }
};

/**
 * verifyRefreshToken — validates a refresh token and checks Redis
 *
 * Two-step verification:
 * 1. Verify the JWT signature and expiry (cryptographic check)
 * 2. Confirm the jti exists in Redis (revocation check)
 *
 * Step 2 is what makes logout work. Even a cryptographically
 * valid token is rejected if its jti has been deleted from Redis.
 */
export const verifyRefreshToken = async (token: string): Promise<RefreshTokenPayload> => {
  // Step 1 — cryptographic verification
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(token, env.REFRESH_TOKEN_SECRET as string) as RefreshTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Refresh token expired');
    }
    throw ApiError.unauthorized('Invalid refresh token');
  }

  // Step 2 — Redis revocation check
  const storedUserId = await redis.get(refreshTokenKey(payload.userId, payload.jti));

  if (!storedUserId) {
    // Token was revoked (user logged out) or never existed
    throw ApiError.unauthorized('Refresh token has been revoked');
  }

  return payload;
};

// ── Token revocation ─────────────────────────────────

/**
 * revokeRefreshToken — deletes a specific token from Redis
 *
 * Called on logout. The token's jti is removed from Redis.
 * Any subsequent refresh attempt with this token will fail
 * the Redis check in verifyRefreshToken.
 */
export const revokeRefreshToken = async (userId: string, jti: string): Promise<void> => {
  await redis.del(refreshTokenKey(userId, jti));
};

/**
 * revokeAllUserTokens — deletes ALL refresh tokens for a user
 *
 * Called when:
 * - User changes their password (security — force re-login everywhere)
 * - User requests "logout from all devices"
 * - Suspicious activity detected
 *
 * Uses Redis SCAN to find all keys matching the user's pattern.
 * We use SCAN instead of KEYS because KEYS blocks Redis on large
 * datasets. SCAN is incremental and non-blocking.
 */
export const revokeAllUserTokens = async (userId: string): Promise<void> => {
  const pattern = userTokensPattern(userId);
  const keys: string[] = [];

  // SCAN iterates through Redis keys matching the pattern
  // cursor starts at "0" and we keep scanning until it returns "0" again
  let cursor = '0';
  do {
    const [nextCursor, foundKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...foundKeys);
  } while (cursor !== '0');

  // Delete all found keys in a single operation if any exist
  if (keys.length > 0) {
    await redis.del(...keys);
  }
};

/**
 * setRefreshTokenCookie — attaches the refresh token as an httpOnly cookie
 *
 * httpOnly = JavaScript cannot read this cookie (XSS protection)
 * secure = only sent over HTTPS (in production)
 * sameSite = "lax" prevents CSRF attacks while allowing normal navigation
 *
 * This is called from controllers, not the service, but lives here
 * because the cookie configuration belongs with the token logic.
 */
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  path: '/',
};
