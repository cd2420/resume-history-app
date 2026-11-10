import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { LLM_MODEL } from "~/lib/llm.server";
import { MAX_LOG_LENGTH } from "./limits";
import { GENERALIZE_PROMPT, TAG_PROMPT } from "./prompts";
import { normalizeTags } from "./tags";

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
  tags: z.array(z.string()),
});

const tagSuggestionSchema = z.object({ tags: z.array(z.string()) });

export interface Generalization {
  generalized: string;
  changes: ChangeCategory[];
  tags: string[];
}

// Enough for the model to reuse the user's spelling without bloating every request.
const EXISTING_TAG_LIMIT = 100;

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

function withExistingTags(prompt: string, existingTags: readonly string[]): string {
  const known = existingTags.slice(0, EXISTING_TAG_LIMIT);
  return known.length ? `${prompt}\n\n사용자가 이미 쓰는 태그: ${known.join(", ")}` : prompt;
}

/** Calls the Responses API and returns the parsed JSON output, mapping every failure to GeneralizeError. */
export async function requestJson(llm: DrawerLlmClient, body: CreateParams): Promise<unknown> {
  let response: ResponseResult;
  try {
    response = await llm.responses.create(body);
  } catch (cause) {
    throw new GeneralizeError("api", { cause });
  }

  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason;
    throw new GeneralizeError(reason === "content_filter" ? "refused" : "truncated");
  }
  if (response.status && response.status !== "completed") throw new GeneralizeError("api");

  // Read outside the try: a refusal must surface as "refused", not as a JSON error.
  const text = outputText(response);
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new GeneralizeError("invalid", { cause });
  }
}

/**
 * Rewrites one daily answer with company secrets generalized and picks search tags.
 * store: false keeps the raw text out of OpenAI's stored application state; the caller
 * must also never persist or log `text`. Only existing (already generalized) tag names
 * are sent along.
 */
export async function generalize(
  llm: DrawerLlmClient,
  text: string,
  existingTags: readonly string[] = [],
): Promise<Generalization> {
  const input = text.trim();
  if (!input) throw new GeneralizeError("empty");
  if (input.length > MAX_LOG_LENGTH) throw new GeneralizeError("too_long");

  const json = await requestJson(llm, {
    model: LLM_MODEL,
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: GENERALIZE_MAX_TOKENS,
    instructions: withExistingTags(GENERALIZE_PROMPT, existingTags),
    input: [{ role: "user", content: input }],
    text: { format: zodTextFormat(generalizationSchema, "generalized_log") },
  });
  const parsed = generalizationSchema.safeParse(json);
  if (!parsed.success) throw new GeneralizeError("invalid", { cause: parsed.error });

  const generalized = parsed.data.generalized.trim();
  if (!generalized || generalized.length > MAX_LOG_LENGTH) throw new GeneralizeError("invalid");
  return {
    generalized,
    changes: [...new Set(parsed.data.changes)],
    tags: normalizeTags(parsed.data.tags, existingTags),
  };
}

/** Tags for a log saved before tagging existed. `content` is already generalized. */
export async function suggestTags(
  llm: DrawerLlmClient,
  content: string,
  existingTags: readonly string[] = [],
): Promise<string[]> {
  const input = content.trim();
  if (!input) throw new GeneralizeError("empty");

  const json = await requestJson(llm, {
    model: LLM_MODEL,
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: GENERALIZE_MAX_TOKENS,
    instructions: withExistingTags(TAG_PROMPT, existingTags),
    input: [{ role: "user", content: input }],
    text: { format: zodTextFormat(tagSuggestionSchema, "log_tags") },
  });
  const parsed = tagSuggestionSchema.safeParse(json);
  if (!parsed.success) throw new GeneralizeError("invalid", { cause: parsed.error });
  return normalizeTags(parsed.data.tags, existingTags);
}
