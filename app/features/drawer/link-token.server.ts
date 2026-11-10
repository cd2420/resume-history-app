import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// The RLS policy caps expires_at at DB now() + 10 minutes; 9 leaves room for clock skew.
export const LINK_TOKEN_TTL_MS = 9 * 60 * 1000;

// 32 random bytes -> 43 base64url chars, inside Telegram's 64-char start parameter limit.
export function createLinkToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashLinkToken(token) };
}

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isLinkTokenShape(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

// Constant-time comparison for shared secrets (webhook and cron headers).
export function secretsMatch(received: string | null, expected: string): boolean {
  if (received === null) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
