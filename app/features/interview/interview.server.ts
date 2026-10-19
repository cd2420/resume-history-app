import type OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { LLM_MODEL } from "~/lib/llm.server";
import { DRAFT_PROMPT, INTERVIEWER_PROMPT } from "./prompts";
import { type ChatTurn, type ProjectDraft, projectDraftSchema } from "./schema";

// Reasoning tokens count toward these caps, so they sit well above the visible reply size.
const QUESTION_MAX_TOKENS = 1000;
const DRAFT_MAX_TOKENS = 4000;

type CreateParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
type Completion = OpenAI.Chat.ChatCompletion;

// Narrow slice of the OpenAI client so tests and E2E can inject a fake.
export interface LlmClient {
  chat: { completions: { create(body: CreateParams): Promise<Completion> } };
}

export type InterviewFailure = "empty" | "truncated" | "refused" | "invalid" | "api";

export class InterviewError extends Error {
  constructor(
    readonly reason: InterviewFailure,
    options?: { cause?: unknown },
  ) {
    super(`interview failed: ${reason}`, options);
    this.name = "InterviewError";
  }
}

async function complete(llm: LlmClient, body: CreateParams): Promise<string> {
  let result: Completion;
  try {
    result = await llm.chat.completions.create(body);
  } catch (cause) {
    throw new InterviewError("api", { cause });
  }

  const choice = result.choices[0];
  if (!choice) throw new InterviewError("invalid");
  if (choice.finish_reason === "length") throw new InterviewError("truncated");
  if (choice.finish_reason === "content_filter" || choice.message.refusal) {
    throw new InterviewError("refused");
  }
  const content = choice.message.content?.trim();
  if (!content) throw new InterviewError("invalid");
  return content;
}

export async function nextQuestion(llm: LlmClient, turns: ChatTurn[]): Promise<string> {
  return complete(llm, {
    model: LLM_MODEL,
    reasoning_effort: "low",
    max_completion_tokens: QUESTION_MAX_TOKENS,
    messages: [{ role: "system", content: INTERVIEWER_PROMPT }, ...turns],
  });
}

export async function extractDraft(llm: LlmClient, turns: ChatTurn[]): Promise<ProjectDraft> {
  if (!turns.some((turn) => turn.role === "user")) {
    throw new InterviewError("empty");
  }

  const content = await complete(llm, {
    model: LLM_MODEL,
    reasoning_effort: "low",
    max_completion_tokens: DRAFT_MAX_TOKENS,
    response_format: zodResponseFormat(projectDraftSchema, "project_draft"),
    messages: [...turns, { role: "system", content: DRAFT_PROMPT }],
  });

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (cause) {
    throw new InterviewError("invalid", { cause });
  }
  const parsed = projectDraftSchema.safeParse(json);
  if (!parsed.success) throw new InterviewError("invalid", { cause: parsed.error });
  return parsed.data;
}
