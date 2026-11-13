import { z } from "zod";

const envSchema = z
  .object({
    OPENAI_API_KEY: z.string().min(1),
    SUPABASE_URL: z.url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    // New-style secret key (sb_secret_...). Bypasses RLS: server-only, drawer.server.ts only.
    SUPABASE_SECRET_KEY: z.string().min(1),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
    // Telegram allows 1-256 chars of A-Z, a-z, 0-9, _ and - for secret_token.
    TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
    CRON_SECRET: z.string().min(32),
    APP_URL: z.url(),
    NODE_ENV: z.string().optional(),
    E2E_FAKE_LLM: z.literal("1").optional(),
    // Path of a JSONL file the fake Telegram client appends sent messages to.
    E2E_FAKE_TELEGRAM_OUTBOX: z.string().min(1).optional(),
  })
  .refine((env) => !(env.E2E_FAKE_LLM && env.NODE_ENV === "production"), {
    path: ["E2E_FAKE_LLM"],
    message: "must not be set in production",
  })
  .refine((env) => !(env.E2E_FAKE_TELEGRAM_OUTBOX && env.NODE_ENV === "production"), {
    path: ["E2E_FAKE_TELEGRAM_OUTBOX"],
    message: "must not be set in production",
  });

export type Env = z.infer<typeof envSchema> & {
  isFakeLlm: boolean;
  isFakeTelegram: boolean;
  /** Demo mode: no Supabase, OpenAI or Telegram; in-memory data and a web bot simulator. */
  isDemo: boolean;
  /**
   * Bot messages carry Telegram login buttons (login_url) that sign the user in on the web.
   * Production only: Telegram accepts them only for the domain set with BotFather /setdomain.
   */
  telegramLogin: boolean;
};

type EnvSource = Record<string, string | undefined>;

// Reports only key names so secret values never reach logs.
export function parseEnv(source: EnvSource): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Invalid environment variables: ${keys.join(", ")}`);
  }
  return {
    ...result.data,
    APP_URL: result.data.APP_URL.replace(/\/+$/, ""),
    isFakeLlm: result.data.E2E_FAKE_LLM === "1",
    isFakeTelegram: Boolean(result.data.E2E_FAKE_TELEGRAM_OUTBOX),
    isDemo: false,
    telegramLogin: source.VERCEL_ENV === "production" && !result.data.E2E_FAKE_TELEGRAM_OUTBOX,
  };
}

function demoEnv(source: EnvSource): Env {
  const vercelUrl = source.VERCEL_URL ? `https://${source.VERCEL_URL}` : undefined;
  const appUrl = (source.APP_URL ?? vercelUrl ?? "http://localhost:5173").replace(/\/+$/, "");
  return {
    OPENAI_API_KEY: "demo",
    SUPABASE_URL: "https://demo.invalid",
    SUPABASE_ANON_KEY: "demo",
    SUPABASE_SECRET_KEY: "demo",
    TELEGRAM_BOT_TOKEN: "demo",
    TELEGRAM_BOT_USERNAME: "demo_drawer_bot",
    TELEGRAM_WEBHOOK_SECRET: "demo_webhook_secret_not_used_0000000000",
    CRON_SECRET: "demo-cron-secret-not-used-000000000000",
    APP_URL: appUrl,
    NODE_ENV: source.NODE_ENV,
    isFakeLlm: true,
    isFakeTelegram: true,
    isDemo: true,
    telegramLogin: false,
  };
}

/**
 * Real env when every key is set. Otherwise demo mode, except on a Vercel production
 * deployment, which must never silently run on fake data.
 */
export function resolveEnv(source: EnvSource): Env {
  const isProductionDeploy = source.VERCEL_ENV === "production";
  if (source.DEMO_MODE === "1") {
    if (isProductionDeploy) throw new Error("DEMO_MODE must not be set on a production deployment");
    return demoEnv(source);
  }
  if (isProductionDeploy) return parseEnv(source);
  try {
    return parseEnv(source);
  } catch (error) {
    console.warn(`${(error as Error).message} — running in demo mode`);
    return demoEnv(source);
  }
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= resolveEnv(process.env);
  return cachedEnv;
}
