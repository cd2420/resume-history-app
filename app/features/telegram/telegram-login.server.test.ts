import { createHash, createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";

import { TELEGRAM_LOGIN_MAX_AGE_SECONDS, verifyTelegramLogin } from "./telegram-login.server";

const TOKEN = "123456:test-bot-token";
const NOW_MS = Date.UTC(2026, 10, 13, 12, 0, 0);
const NOW_S = NOW_MS / 1000;

/** Signs fields the way Telegram does (widgets/login#checking-authorization). */
function signed(fields: Record<string, string>, token = TOKEN): URLSearchParams {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash });
}

const FIELDS = { id: "111", first_name: "대근", username: "dg", auth_date: String(NOW_S - 10) };

describe("verifyTelegramLogin", () => {
  test("accepts data signed with the bot token", () => {
    expect(verifyTelegramLogin(signed(FIELDS), TOKEN, NOW_MS)).toEqual({ telegramUserId: 111 });
  });

  test("rejects data signed with another bot's token", () => {
    expect(verifyTelegramLogin(signed(FIELDS, "999:other"), TOKEN, NOW_MS)).toBeNull();
  });

  test("rejects a changed field, including the user id", () => {
    const params = signed(FIELDS);
    params.set("id", "222");
    expect(verifyTelegramLogin(params, TOKEN, NOW_MS)).toBeNull();
  });

  test("rejects an added field", () => {
    const params = signed(FIELDS);
    params.append("next", "https://evil.example");
    expect(verifyTelegramLogin(params, TOKEN, NOW_MS)).toBeNull();
  });

  test("rejects a repeated field", () => {
    const params = signed(FIELDS);
    params.append("id", "222");
    expect(verifyTelegramLogin(params, TOKEN, NOW_MS)).toBeNull();
  });

  test("rejects stale and future data", () => {
    const stale = { ...FIELDS, auth_date: String(NOW_S - TELEGRAM_LOGIN_MAX_AGE_SECONDS - 1) };
    const future = { ...FIELDS, auth_date: String(NOW_S + 120) };
    expect(verifyTelegramLogin(signed(stale), TOKEN, NOW_MS)).toBeNull();
    expect(verifyTelegramLogin(signed(future), TOKEN, NOW_MS)).toBeNull();
  });

  test("rejects missing or malformed data (user declined: no fields at all)", () => {
    expect(verifyTelegramLogin(new URLSearchParams(), TOKEN, NOW_MS)).toBeNull();
    const noHash = signed(FIELDS);
    noHash.delete("hash");
    expect(verifyTelegramLogin(noHash, TOKEN, NOW_MS)).toBeNull();
    const shortHash = signed(FIELDS);
    shortHash.set("hash", "abc");
    expect(verifyTelegramLogin(shortHash, TOKEN, NOW_MS)).toBeNull();
    expect(verifyTelegramLogin(signed({ ...FIELDS, id: "-5" }), TOKEN, NOW_MS)).toBeNull();
  });
});
