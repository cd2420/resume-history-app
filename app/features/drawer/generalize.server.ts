import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { LLM_MODEL } from "~/lib/llm.server";
import { MAX_LOG_LENGTH } from "./limits";
import { ANSWER_COMMON_PROMPT, ANSWER_ROLE_PROMPTS } from "./prompts";
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

// Question 3 also writes the day's combined log, so it needs no extra call to join the answers.
const entrySchema = generalizationSchema.extend({ entry: z.string() });

export interface Generalization {
  generalized: string;
  changes: ChangeCategory[];
  tags: string[];
  /** Question 3 only: the day's log combining all answers. null when absent or unusable. */
  entry: string | null;
}

export type AnswerStep = 1 | 2 | 3;

export interface AnswerContext {
  step?: AnswerStep;
  /** Earlier answers of this session, already generalized. Raw text never goes here. */
  previous?: { task?: string | null; role?: string | null };
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

/** Shared rules, then this question's editor role, then the earlier (already generalized) answers. */
function answerInstructions(step: AnswerStep, previous: AnswerContext["previous"] = {}): string {
  const earlier = [previous.task && `① 오늘 한 일: ${previous.task}`, previous.role && `② 내 역할·이유: ${previous.role}`].filter(Boolean);
  const context = step > 1 ? `\n\n앞 질문 정리:\n${earlier.length ? earlier.join("\n") : "(없음)"}` : "";
  return `${ANSWER_COMMON_PROMPT}\n\n${ANSWER_ROLE_PROMPTS[step]}${context}`;
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
 * Rewrites one answer with company secrets generalized and picks search tags, as the editor
 * role of its question. Earlier answers are passed only as their generalized summaries.
 * store: false keeps the raw text out of OpenAI's stored application state; the caller
 * must also never persist or log `text`. Only existing (already generalized) tag names
 * are sent along.
 */
export async function generalize(
  llm: DrawerLlmClient,
  text: string,
  existingTags: readonly string[] = [],
  { step = 1, previous }: AnswerContext = {},
): Promise<Generalization> {
  const input = text.trim();
  if (!input) throw new GeneralizeError("empty");
  if (input.length > MAX_LOG_LENGTH) throw new GeneralizeError("too_long");

  const json = await requestJson(llm, {
    model: LLM_MODEL,
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: GENERALIZE_MAX_TOKENS,
    instructions: withExistingTags(answerInstructions(step, previous), existingTags),
    input: [{ role: "user", content: input }],
    text: {
      format: step === 3 ? zodTextFormat(entrySchema, "generalized_entry") : zodTextFormat(generalizationSchema, "generalized_log"),
    },
  });
  const parsed = (step === 3 ? entrySchema : generalizationSchema).safeParse(json);
  if (!parsed.success) throw new GeneralizeError("invalid", { cause: parsed.error });

  const generalized = parsed.data.generalized.trim();
  if (!generalized || generalized.length > MAX_LOG_LENGTH) throw new GeneralizeError("invalid");
  // A bad combined entry only loses the polish: the caller falls back to joining the answers.
  const entry = (parsed.data as Partial<z.infer<typeof entrySchema>>).entry?.trim() ?? "";
  return {
    generalized,
    changes: [...new Set(parsed.data.changes)],
    tags: normalizeTags(parsed.data.tags, existingTags),
    entry: entry && entry.length <= MAX_LOG_LENGTH ? entry : null,
  };
}
