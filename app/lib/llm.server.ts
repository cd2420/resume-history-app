import OpenAI from "openai";

import { createFakeDrawerLlm } from "~/features/drawer/fake-llm";
import type { DrawerLlmClient } from "~/features/drawer/generalize.server";
import { createFakeLlm } from "~/features/interview/fake-llm";
import type { LlmClient } from "~/features/interview/interview.server";
import { getEnv } from "./env.server";

// Cheapest structured-output model per the plan (2026-10-13 pricing). Swap here only.
export const LLM_MODEL = "gpt-6-luna";

// The web interview still uses Chat Completions; the drawer uses the Responses API.
export type AppLlmClient = LlmClient & DrawerLlmClient;

let cachedLlm: AppLlmClient | undefined;

export function getLlm(): AppLlmClient {
  if (!cachedLlm) {
    const env = getEnv();
    cachedLlm = env.isFakeLlm
      ? { ...createFakeLlm(), ...createFakeDrawerLlm() }
      : new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return cachedLlm;
}
