import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { LLM_MODEL } from "~/lib/llm.server";
import { MAX_LOG_LENGTH } from "./limits";
import { GENERALIZE_PROMPT } from "./prompts";

export { MAX_LOG_LENGTH };

// Reasoning tokens count toward this cap, so it sits well above the visible output size.
const GENERALIZE_MAX_TOKENS = 3000;

export const CHANGE_CATEGORIES = [
  "client_name",
  "internal_system",
  "absolute_number",
  "person_name",
  "other",
] as const;

export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number];

export const generalizationSchema = z.object({
  generalized: z.string(),
  changes: z.array(z.enum(CHANGE_CATEGORIES)),
});

export interface Generalization {
  generalized: string;
  changes: ChangeCategory[];
}

type CreateParams = OpenAI.Responses.ResponseCreateParamsNonStreaming;
type ResponseResult = OpenAI.Responses.Response;

// Narrow slice of the OpenAI client so tests and E2E can inject a fake.
export interface DrawerLlmClient {
  responses: { create(body: CreateParams): Promise<ResponseResult> };
}

export type GeneralizeFailure = "empty" | "too_long" | "truncated" | "refused" | "invalid" | "api";

export class GeneralizeError extends Error {
  constructor(
    readonly reason: GeneralizeFailure,
    options?: { cause?: unknown },
  ) {
    super(`generalize failed: ${reason}`, options);
    this.name = "GeneralizeError";
  }
}

function outputText(response: ResponseResult): string {
  let text = "";
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type === "refusal") throw new GeneralizeError("refused");
      if (part.type === "output_text") text += part.text;
    }
  }
  return text;
}

/**
 * Rewrites one daily answer with company secrets generalized.
 * store: false keeps the raw text out of OpenAI's stored application state; the caller
 * must also never persist or log `text`.
 */
export async function generalize(llm: DrawerLlmClient, text: string): Promise<Generalization> {
  const input = text.trim();
  if (!input) throw new GeneralizeError("empty");
  if (input.length > MAX_LOG_LENGTH) throw new GeneralizeError("too_long");

  let response: ResponseResult;
  try {
    response = await llm.responses.create({
      model: LLM_MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: GENERALIZE_MAX_TOKENS,
      instructions: GENERALIZE_PROMPT,
      input: [{ role: "user", content: input }],
      text: { format: zodTextFormat(generalizationSchema, "generalized_log") },
    });
  } catch (cause) {
    throw new GeneralizeError("api", { cause });
  }

  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason;
    throw new GeneralizeError(reason === "content_filter" ? "refused" : "truncated");
  }
  if (response.status && response.status !== "completed") throw new GeneralizeError("api");

  const raw = outputText(response);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (cause) {
    throw new GeneralizeError("invalid", { cause });
  }
  const parsed = generalizationSchema.safeParse(json);
  if (!parsed.success) throw new GeneralizeError("invalid", { cause: parsed.error });

  const generalized = parsed.data.generalized.trim();
  if (!generalized || generalized.length > MAX_LOG_LENGTH) throw new GeneralizeError("invalid");
  return { generalized, changes: [...new Set(parsed.data.changes)] };
}
