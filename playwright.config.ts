import { defineConfig } from "@playwright/test";

// Loads .env (E2E_USER_EMAIL, E2E_USER_PASSWORD, TELEGRAM_WEBHOOK_SECRET) for the test process.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env: specs that need it skip themselves.
}

const PORT = 5174;
export const TELEGRAM_OUTBOX = "test-results/telegram-outbox.jsonl";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    trace: "off",
    // Optional override when the installed browser does not match this Playwright version.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    // Fake LLM and fake Telegram: no OpenAI cost, no real bot messages.
    env: {
      E2E_FAKE_LLM: "1",
      E2E_FAKE_TELEGRAM_OUTBOX: TELEGRAM_OUTBOX,
      APP_URL: `http://localhost:${PORT}`,
    },
  },
});
