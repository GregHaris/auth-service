import crypto from 'crypto';

/**
 * generateOTP — generates a 6-digit one-time password
 *
 * Used for email verification and future 2FA.
 *
 * crypto.randomInt(min, max) generates a cryptographically secure
 * random integer in the range [min, max).
 *
 * Range: 100000–999999 ensures we always get exactly 6 digits
 * (no leading zeros that would make it look like 5 digits)
 *
 * Returns a string because "012345" would lose the leading zero
 * as a number, and we always want consistent 6-character display.
 */
export const generateOTP = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * generateResetToken — generates a cryptographically secure URL-safe token
 *
 * Used for password reset links embedded in emails.
 *
 * 32 bytes = 256 bits of entropy — effectively impossible to guess.
 * hex encoding gives us a 64-character string using only [0-9a-f].
 *
 * We store the HASH of this token in the database, not the token itself.
 * This way, even if your database is compromised, attackers can't use
 * the stored values to reset passwords — they'd need the original token
 * which only exists in the email we sent.
 */
export const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * hashToken — creates a SHA-256 hash of a token for safe storage
 *
 * Used before storing reset tokens in the database.
 *
 * SHA-256 is used here (not bcrypt) because:
 * - Reset tokens are already 256 bits of entropy — they don't need
 *   the extra brute-force protection bcrypt provides for passwords
 * - SHA-256 is fast — we need to hash on every request to compare,
 *   and the token's entropy already makes brute-force impractical
 * - bcrypt is slow by design — good for low-entropy passwords,
 *   unnecessary overhead for high-entropy random tokens
 */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * generateExpiryDate — creates a Date object N minutes from now
 *
 * Centralised here so expiry logic is consistent across the codebase.
 * Pass 15 for OTPs, 60 for reset tokens.
 */
export const generateExpiryDate = (minutesFromNow: number): Date => {
  return new Date(Date.now() + minutesFromNow * 60 * 1000);
};
