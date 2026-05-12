/**
 * maskEmail — partially hides an email address for privacy
 *
 * Why mask emails in API responses?
 * - If someone tries email enumeration (typing random emails into
 *   forgot password), they only get back partial addresses
 * - The user who actually owns the email will recognize it
 * - Someone fishing for valid emails won't learn anything useful
 *
 * Rules:
 * - Single character local part: shows first char (e.g., "a***@gmail.com")
 * - Short local parts (2-3 chars): shows first char
 * - Normal local parts (4+ chars): shows first char + 3 asterisks + last char
 * - Domain: always shows first 2 chars + remainder with asterisks
 *
 * Examples:
 *   greg@example.com       → gr***g@ex*****.com
 *   a@example.com          → a***@ex*****.com
 *   jane.doe@company.org   → ja*****e@co******.org
 *   user@sub.domain.co.uk  → us***r@su********.co.uk
 */
export const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');

  if (!local || !domain) {
    return email;
  }

  // ── Mask local part ─────
  let maskedLocal: string;

  if (local.length <= 1) {
    // "a" → "a***"
    maskedLocal = local + '***';
  } else if (local.length <= 3) {
    // "ab" → "a***"
    // "abc" → "a***"
    maskedLocal = local[0] + '***';
  } else {
    // "greg" → "gr***g"
    // "jane.doe" → "ja*****e"
    const firstChar = local[0];
    const lastChar = local[local.length - 1];
    const middleLength = local.length - 2;
    // Minimum 3 asterisks, or length - 2 if that's more
    const asteriskCount = Math.max(3, middleLength);
    maskedLocal = firstChar + '*'.repeat(asteriskCount) + lastChar;
  }

  // ── Mask domain ──
  const domainParts = domain.split('.');

  if (domainParts.length === 0) {
    return maskedLocal + '@***';
  }

  // First part of domain gets masked (e.g., "gmail" from "gmail.com")
  const firstDomainPart = domainParts[0];

  let maskedFirstPart: string;
  if (firstDomainPart.length <= 2) {
    maskedFirstPart = firstDomainPart + '**';
  } else {
    maskedFirstPart = firstDomainPart.substring(0, 2) + '*'.repeat(firstDomainPart.length - 2);
  }

  // Keep remaining parts (like .com, .co.uk) visible
  const remainingParts = domainParts.slice(1).join('.');

  const maskedDomain = remainingParts ? `${maskedFirstPart}.${remainingParts}` : maskedFirstPart;

  return `${maskedLocal}@${maskedDomain}`;
};
