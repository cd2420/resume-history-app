import { vi } from "vitest";

// Complete, fake environment for tests. Values are not real secrets.
export const TEST_ENV = {
  OPENAI_API_KEY: "sk-test-secret-value",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-test-secret-value",
  SUPABASE_SECRET_KEY: "sb_secret_test-secret-value",
  TELEGRAM_BOT_TOKEN: "123456:telegram-test-secret-value",
  TELEGRAM_BOT_USERNAME: "resume_drawer_bot",
  TELEGRAM_WEBHOOK_SECRET: "webhook_secret_value_0123456789abcdef",
  CRON_SECRET: "cron-secret-value-0123456789abcdef",
  APP_URL: "https://drawer.example.com/",
} as const;

export function stubTestEnv() {
  for (const [key, value] of Object.entries(TEST_ENV)) {
    vi.stubEnv(key, value);
  }
}
