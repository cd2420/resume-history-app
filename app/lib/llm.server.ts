import OpenAI from "openai";

import { createFakeLlm } from "~/features/interview/fake-llm";
import type { LlmClient } from "~/features/interview/interview.server";
import { getEnv } from "./env.server";

// Cheapest structured-output model per the plan (2026-10-13 pricing). Swap here only.
export const LLM_MODEL = "gpt-6-luna";

let cachedLlm: LlmClient | undefined;

export function getLlm(): LlmClient {
  if (!cachedLlm) {
    const env = getEnv();
    cachedLlm = env.isFakeLlm ? createFakeLlm() : new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return cachedLlm;
}
