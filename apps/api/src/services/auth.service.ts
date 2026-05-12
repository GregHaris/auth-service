import { ApiError } from '@/utils/ApiError';
import { EmailTokenType } from '@/generated/prisma/enums';
import { env } from '@/config/env';
import { generateExpiryDate, generateResetToken, generateOTP, hashToken } from '@/utils/token';
import { generateTokenPair, revokeRefreshToken, revokeAllUserTokens } from './token.service';
import { hashPassword, comparePassword } from '@/utils/hash';
import { prisma } from '@/config/db';
import { toSafeUser } from '@/types/user.type';
import type { RegisterInput, LoginInput } from '@/utils/validator';

export const registerUser = async (input: RegisterInput) => {
  const { email, password, firstName, lastName } = input;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { email, firstName, lastName, passwordHash },
  });

  const otp = generateOTP();

  await prisma.emailToken.create({
    data: {
      token: otp,
      userId: user.id,
      type: EmailTokenType.EMAIL_VERIFICATION,
      expiresAt: generateExpiryDate(15),
    },
  });

  const tokens = await generateTokenPair({
    userId: user.id,
    email: user.email,
    isVerified: false,
  });

  return {
    user: toSafeUser(user),
    tokens,
    otp,
  };
};

export const loginUser = async (input: LoginInput) => {
  const { email, password } = input;

  const user = await prisma.user.findUnique({ where: { email } });

  // Use generic error to prevent user enumeration
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // OAuth-only accounts have no password
  if (!user.passwordHash) {
    throw ApiError.unauthorized('This account uses Google sign-in. Please continue with Google.');
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const tokens = await generateTokenPair({
    userId: user.id,
    email: user.email,
    isVerified: user.isVerified,
  });

  return { user: toSafeUser(user), tokens };
};

export const logoutUser = async (userId: string, jti: string) => {
  await revokeRefreshToken(userId, jti);
};

export const logoutAllDevices = async (userId: string) => {
  await revokeAllUserTokens(userId);
};

export const verifyEmail = async (userId: string, otp: string) => {
  const emailToken = await prisma.emailToken.findFirst({
    where: {
      userId,
      token: otp,
      type: EmailTokenType.EMAIL_VERIFICATION,
      expiresAt: { gt: new Date() },
    },
  });

  if (!emailToken) {
    throw ApiError.badRequest('Invalid or expired verification code');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isVerified: true },
  });

  // Delete the used token so it can't be reused
  await prisma.emailToken.delete({
    where: { id: emailToken.id },
  });
};

export const resendVerificationOtp = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });

  // Don't reveal if email exists (user enumeration protection)
  if (!user) {
    return;
  }

  if (user.isVerified) {
    return;
  }

  // Delete any existing verification tokens for this user
  await prisma.emailToken.deleteMany({
    where: {
      userId: user.id,
      type: EmailTokenType.EMAIL_VERIFICATION,
    },
  });

  // Generate new OTP
  const otp = generateOTP();

  await prisma.emailToken.create({
    data: {
      token: otp,
      userId: user.id,
      type: EmailTokenType.EMAIL_VERIFICATION,
      expiresAt: generateExpiryDate(15),
    },
  });

  // TODO: Send email with Resend or similar service
  console.log(`📧 New verification OTP for ${user.email}: ${otp}`);
};

export const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return;
  }

  if (!user.passwordHash) {
    return;
  }

  const resetToken = generateResetToken();

  const tokenHash = hashToken(resetToken);

  // Delete any existing reset tokens
  await prisma.emailToken.deleteMany({
    where: {
      userId: user.id,
      type: EmailTokenType.PASSWORD_RESET,
    },
  });

  // Store the hashed token
  await prisma.emailToken.create({
    data: {
      token: tokenHash,
      userId: user.id,
      type: EmailTokenType.PASSWORD_RESET,
      expiresAt: generateExpiryDate(60),
    },
  });

  const resetLink = `${env.CLIENT_URL}/reset-password?token=${resetToken}`;

  // TODO: Send email with Resend
  console.log(`📧 Password reset link for ${user.email}: ${resetLink}`);
};

export const resetPassword = async (token: string, newPassword: string) => {
  const tokenHash = hashToken(token);

  // Find a valid reset token
  const emailToken = await prisma.emailToken.findFirst({
    where: {
      token: tokenHash,
      type: EmailTokenType.PASSWORD_RESET,
      expiresAt: { gt: new Date() },
    },
  });

  if (!emailToken) {
    throw ApiError.badRequest('Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: emailToken.userId },
    data: { passwordHash },
  });

  // Delete the used token
  await prisma.emailToken.delete({
    where: { id: emailToken.id },
  });

  // Revoke all existing sessions - security measure
  // If someone else had access to the account, they're now locked out
  await revokeAllUserTokens(emailToken.userId);
};
