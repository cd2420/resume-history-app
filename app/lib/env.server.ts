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

export type Env = z.infer<typeof envSchema> & { isFakeLlm: boolean; isFakeTelegram: boolean };

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
  };
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}
