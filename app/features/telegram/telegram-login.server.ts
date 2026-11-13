// Checks the sign-in data Telegram appends to a login_url button's URL.
// https://core.telegram.org/widgets/login#checking-authorization
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Telegram stamps auth_date when the user taps the button, so a fresh login is seconds old. */
export const TELEGRAM_LOGIN_MAX_AGE_SECONDS = 5 * 60;
// Tolerates a server clock that runs a little behind Telegram's.
const CLOCK_SKEW_SECONDS = 60;

export interface TelegramLogin {
  telegramUserId: number;
}

/**
 * Returns the Telegram user only when the hash matches and the data is fresh. Every received
 * field except `hash` is signed, so the page URL must carry no query of its own.
 */
export function verifyTelegramLogin(params: URLSearchParams, botToken: string, nowMs: number): TelegramLogin | null {
  const hash = params.get("hash");
  const id = params.get("id");
  const authDate = Number(params.get("auth_date"));
  if (!hash || !/^[0-9a-f]{64}$/.test(hash) || !id || !/^[1-9][0-9]{0,15}$/.test(id)) return null;
  if (!Number.isInteger(authDate)) return null;

  const fields = new Map<string, string>();
  for (const [key, value] of params) {
    if (key === "hash") continue;
    // A repeated key could be signed one way and read another: refuse it.
    if (fields.has(key)) return null;
    fields.set(key, value);
  }
  const dataCheckString = [...fields.keys()]
    .sort()
    .map((key) => `${key}=${fields.get(key)}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) return null;

  const ageSeconds = nowMs / 1000 - authDate;
  if (ageSeconds > TELEGRAM_LOGIN_MAX_AGE_SECONDS || ageSeconds < -CLOCK_SKEW_SECONDS) return null;

  return { telegramUserId: Number(id) };
}
