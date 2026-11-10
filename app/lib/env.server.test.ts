import { afterEach, describe, expect, test, vi } from "vitest";

import { parseEnv } from "./env.server";
import { stubTestEnv, TEST_ENV } from "./test-env";

const VALID_ENV = TEST_ENV;

describe("parseEnv", () => {
  test("returns parsed env when all required variables are present", () => {
    const env = parseEnv(VALID_ENV);

    expect(env.OPENAI_API_KEY).toBe(VALID_ENV.OPENAI_API_KEY);
    expect(env.SUPABASE_URL).toBe(VALID_ENV.SUPABASE_URL);
    expect(env.isFakeLlm).toBe(false);
  });

  test("throws listing every missing variable name", () => {
    expect(() => parseEnv({})).toThrow(
      /OPENAI_API_KEY.*SUPABASE_URL.*SUPABASE_ANON_KEY/,
    );
  });

  test("throws when SUPABASE_URL is not a URL", () => {
    expect(() => parseEnv({ ...VALID_ENV, SUPABASE_URL: "not-a-url" })).toThrow(
      /SUPABASE_URL/,
    );
  });

  test("never includes secret values in the error message", () => {
    const run = () =>
      parseEnv({ ...VALID_ENV, SUPABASE_URL: "not-a-url" });

    expect(run).toThrow();
    try {
      run();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain(VALID_ENV.OPENAI_API_KEY);
      expect(message).not.toContain(VALID_ENV.SUPABASE_ANON_KEY);
      expect(message).not.toContain(VALID_ENV.SUPABASE_SECRET_KEY);
    }
  });

  test("lists every missing drawer variable name", () => {
    expect(() =>
      parseEnv({
        OPENAI_API_KEY: VALID_ENV.OPENAI_API_KEY,
        SUPABASE_URL: VALID_ENV.SUPABASE_URL,
        SUPABASE_ANON_KEY: VALID_ENV.SUPABASE_ANON_KEY,
      }),
    ).toThrow(
      /SUPABASE_SECRET_KEY.*TELEGRAM_BOT_TOKEN.*TELEGRAM_BOT_USERNAME.*TELEGRAM_WEBHOOK_SECRET.*CRON_SECRET.*APP_URL/,
    );
  });

  test("rejects a webhook secret Telegram would not accept", () => {
    expect(() =>
      parseEnv({ ...VALID_ENV, TELEGRAM_WEBHOOK_SECRET: "has spaces and is long enough!!!!" }),
    ).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
  });

  test("strips trailing slashes from APP_URL", () => {
    expect(parseEnv(VALID_ENV).APP_URL).toBe("https://drawer.example.com");
  });

  test("refuses the fake Telegram outbox in production", () => {
    expect(() =>
      parseEnv({ ...VALID_ENV, NODE_ENV: "production", E2E_FAKE_TELEGRAM_OUTBOX: "out.jsonl" }),
    ).toThrow(/E2E_FAKE_TELEGRAM_OUTBOX/);
  });

  test("enables fake LLM outside production", () => {
    const env = parseEnv({
      ...VALID_ENV,
      NODE_ENV: "development",
      E2E_FAKE_LLM: "1",
    });

    expect(env.isFakeLlm).toBe(true);
  });

  test("refuses fake LLM in production", () => {
    expect(() =>
      parseEnv({ ...VALID_ENV, NODE_ENV: "production", E2E_FAKE_LLM: "1" }),
    ).toThrow(/E2E_FAKE_LLM/);
  });
});

describe("getEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("reads process.env once and caches the result", async () => {
    vi.resetModules();
    stubTestEnv();
    const { getEnv } = await import("./env.server");

    const first = getEnv();
    vi.stubEnv("SUPABASE_URL", "https://changed.supabase.co");

    expect(getEnv()).toBe(first);
    expect(first.SUPABASE_URL).toBe(VALID_ENV.SUPABASE_URL);
  });
});
