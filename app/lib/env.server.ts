import { z } from "zod";

const envSchema = z
  .object({
    OPENAI_API_KEY: z.string().min(1),
    SUPABASE_URL: z.url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    NODE_ENV: z.string().optional(),
    E2E_FAKE_LLM: z.literal("1").optional(),
  })
  .refine((env) => !(env.E2E_FAKE_LLM && env.NODE_ENV === "production"), {
    path: ["E2E_FAKE_LLM"],
    message: "must not be set in production",
  });

export type Env = z.infer<typeof envSchema> & { isFakeLlm: boolean };

type EnvSource = Record<string, string | undefined>;

// Reports only key names so secret values never reach logs.
export function parseEnv(source: EnvSource): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Invalid environment variables: ${keys.join(", ")}`);
  }
  return { ...result.data, isFakeLlm: result.data.E2E_FAKE_LLM === "1" };
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}
