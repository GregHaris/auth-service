import { Request, Response } from 'express';

import { ApiError } from '@/utils/ApiError';
import { asyncHandler } from '@/utils/asyncHandler';
import {
  cookieOptions,
  generateTokenPair,
  REFRESH_TOKEN_COOKIE,
  revokeRefreshToken,
  verifyRefreshToken,
} from '@/services/token.service';
import {
  forgotPassword,
  loginUser,
  logoutAllDevices,
  logoutUser,
  registerUser,
  resendVerificationOtp,
  resetPassword,
  verifyEmail,
} from '@/services/auth.service';
import { maskEmail } from '@/utils/maskEmail';
import { prisma } from '@/config/db';

// Create account, send verification OTP, return tokens for immediate login
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { user, tokens, otp } = await registerUser(req.body);

  console.log(`📧 Verification OTP for ${user.email}: ${otp}`);

  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, cookieOptions);

  res.status(201).json({
    status: 'success',
    message: 'Account created. Please verify your email.',
    data: {
      user,
      accessToken: tokens.accessToken,
    },
  });
});

// Authenticate credentials and return tokens
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { user, tokens } = await loginUser(req.body);

  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, cookieOptions);

  res.status(200).json({
    status: 'success',
    message: 'Login successful',
    data: {
      user,
      accessToken: tokens.accessToken,
    },
  });
});

// Revoke the current session's refresh token
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { userId, jti } = (req as any).user;

  await logoutUser(userId, jti);

  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully',
  });
});

// Revoke all sessions for this user across all devices
export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as any).user;

  await logoutAllDevices(userId);

  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });

  res.status(200).json({
    status: 'success',
    message: 'Logged out from all devices',
  });
});

/**
 * POST /auth/refresh
 *
 * Issues a new access token using the refresh token cookie.
 * This is called silently by the frontend when the access token expires.
 *
 * Implements refresh token rotation:
 * - Old refresh token is revoked
 * - New refresh token is issued
 * - This limits the window of opportunity if a refresh token is stolen
 */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  // Read from cookie — not from the request body
  // The browser sends this automatically
  const token = req.cookies[REFRESH_TOKEN_COOKIE];

  if (!token) {
    throw ApiError.unauthorized('No refresh token provided');
  }

  // Verify the token and check Redis
  const payload = await verifyRefreshToken(token);

  // Fetch fresh user data — isVerified may have changed since login
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!user) {
    throw ApiError.unauthorized('User not found');
  }

  // Revoke old refresh token (rotation)
  await revokeRefreshToken(payload.userId, payload.jti);

  // Issue a new token pair
  const tokens = await generateTokenPair({
    userId: user.id,
    email: user.email,
    isVerified: user.isVerified,
  });

  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, cookieOptions);

  res.status(200).json({
    status: 'success',
    data: {
      accessToken: tokens.accessToken,
    },
  });
});

/**
 * POST /auth/verify-email
 *
 * Confirms a user's email address using the OTP sent after registration.
 * Requires authentication - user must be logged in.
 */
export const verifyEmailHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as any).user;
  const { otp } = req.body;

  await verifyEmail(userId, otp);

  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully',
  });
});

/**
 * POST /auth/resend-otp
 *
 * Sends a new verification OTP. Can be called with either an authenticated
 * user or by providing an email address (for users who registered but
 * their token cookie expired).
 */
export const resendOtpHandler = asyncHandler(async (req: Request, res: Response) => {
  // Can accept email from body OR from authenticated user
  const email = req.body.email || (req as any).user?.email;

  if (!email) {
    throw ApiError.badRequest('Email is required');
  }

  await resendVerificationOtp(email);

  // Always return success - prevents user enumeration
  res.status(200).json({
    status: 'success',
    message: `A verification code has been sent to ${maskEmail(email)}`,
  });
});

export const forgotPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  await forgotPassword(email);

  // Always return success - prevents user enumeration
  res.status(200).json({
    status: 'success',
    message: `A reset link has been sent to ${maskEmail(email)}`,
  });
});

export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body;

  await resetPassword(token, password);

  res.status(200).json({
    status: 'success',
    message: 'Password has been reset. Please log in with your new password.',
  });
});
