import bcrypt from 'bcryptjs';

/**
 * The cost factor controls how computationally expensive hashing is.
 * Each increment doubles the work required.
 *
 * 10 = ~100ms on modern hardware — good balance of security vs speed
 * 12 = ~400ms — use for higher security requirements
 * 14 = ~1.5s — overkill for most applications
 *
 * Why does this matter? An attacker trying to brute-force a stolen
 * database has to hash each guess. At cost factor 10, they can try
 * ~10 passwords per second per CPU core instead of millions.
 */
const SALT_ROUNDS = 10;

/**
 * hashPassword — converts a plain text password into a bcrypt hash
 *
 * bcrypt automatically:
 * - Generates a random salt (prevents rainbow table attacks)
 * - Combines the salt with your password
 * - Applies the hashing algorithm N times (based on SALT_ROUNDS)
 * - Returns a single string containing the hash + salt + cost factor
 *
 * The output looks like:
 * $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
 * └──┘└─┘└────────────────────────────────────────────────────┘
 * algo cost           hash (includes the salt)
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * comparePassword — checks if a plain text password matches a hash
 *
 * bcrypt extracts the salt from the stored hash, applies it to the
 * incoming password, and compares the results. You never need to
 * manage salts manually — bcrypt handles it.
 *
 * Returns true if they match, false otherwise.
 * Never throws on mismatch — only throws on invalid input.
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
