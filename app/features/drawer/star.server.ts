// M3: turns a finished book's logs into one STAR summary.
// Only already-generalized log text goes to the model (store: false). The model cites logs by
// short "L<n>" refs; refs that do not match a log are dropped, so evidence can never point at
// a log the user does not own.

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { kstStartOfDay } from "~/lib/kst";
import { LLM_MODEL } from "~/lib/llm.server";
import type { BookLog } from "./bookshelf";
import type { DrawerWebStore } from "./drawer-web.server";
import { type DrawerLlmClient, GeneralizeError, requestJson } from "./generalize.server";
import { DAILY_STAR_LIMIT } from "./limits";
import { isUnlimited } from "./roles";
import { STAR_PROMPT } from "./prompts";
import { FREE_STAR_GENERATIONS, MAX_STAR_TEXT, STAR_FIELDS, type StarDraft, type StarFields, type StarPart, isEdited, type StarQuota } from "./star";

// Reasoning tokens count toward this cap; a STAR is longer than a daily log.
const STAR_MAX_TOKENS = 8000;
// ponytail: newest logs that fit this budget; summarize per month first if books outgrow it.
const STAR_INPUT_CHAR_LIMIT = 40_000;
const MAX_GAPS = 10;

const starPartSchema = z.object({ text: z.string(), evidence: z.array(z.string()), gaps: z.array(z.string()) });
const starSchema = z.object({ situation: starPartSchema, task: starPartSchema, action: starPartSchema, result: starPartSchema });

export type StarFailure = "not_found" | "no_logs" | "limit" | "daily_limit";

export class StarError extends Error {
  constructor(readonly reason: StarFailure) {
    super(`star failed: ${reason}`);
    this.name = "StarError";
  }
}

/** Oldest first, keeping the newest logs that fit the input budget. */
function pickLogs(logs: readonly BookLog[]): BookLog[] {
  const newestFirst = [...logs].sort((a, b) => b.logDate.localeCompare(a.logDate));
  const picked: BookLog[] = [];
  let size = 0;
  for (const log of newestFirst) {
    size += log.content.length;
    if (size > STAR_INPUT_CHAR_LIMIT) break;
    picked.push(log);
  }
  return picked.reverse();
}

function toPart(raw: z.infer<typeof starPartSchema>, idByRef: Map<string, string>): StarPart {
  const text = raw.text.trim();
  if (!text || text.length > MAX_STAR_TEXT) throw new GeneralizeError("invalid");
  const evidence = [...new Set(raw.evidence.map((ref) => idByRef.get(ref.trim())).filter((id) => id !== undefined))];
  const gaps = [...new Set(raw.gaps.map((gap) => gap.trim()).filter(Boolean))].slice(0, MAX_GAPS);
  return { text, evidence, gaps };
}

/** STARs the user may still make today, read from the same caps generateStar enforces. */
export async function getStarQuota(store: DrawerWebStore, now: Date = new Date()): Promise<StarQuota> {
  const [role, today] = await Promise.all([store.getRole(), store.countStarsSince(kstStartOfDay(now))]);
  if (isUnlimited(role)) return { isUnlimited: true, remainingToday: null };
  return { isUnlimited: false, remainingToday: Math.max(0, DAILY_STAR_LIMIT - today) };
}

/** Ends the book and stores a fresh draft. Throws StarError or GeneralizeError (model failure). */
export async function generateStar(store: DrawerWebStore, llm: DrawerLlmClient, bookId: string, now: Date = new Date()): Promise<void> {
  const [detail, existing, today, role] = await Promise.all([
    store.getBook(bookId),
    store.getStar(bookId),
    store.countStarsSince(kstStartOfDay(now)),
    store.getRole(),
  ]);
  if (!detail) throw new StarError("not_found");
  if (detail.logs.length === 0) throw new StarError("no_logs");
  const count = (existing?.generationCount ?? 0) + 1;
  if (!isUnlimited(role)) {
    if (count > FREE_STAR_GENERATIONS) throw new StarError("limit");
    if (today >= DAILY_STAR_LIMIT) throw new StarError("daily_limit");
  }

  const logs = pickLogs(detail.logs);
  const idByRef = new Map(logs.map((log, index) => [`L${index + 1}`, log.id]));
  const input = logs.map((log, index) => `L${index + 1} (${log.logDate}) ${log.content}`).join("\n");

  const json = await requestJson(llm, {
    model: LLM_MODEL,
    store: false,
    reasoning: { effort: "medium" },
    max_output_tokens: STAR_MAX_TOKENS,
    instructions: STAR_PROMPT,
    input: [{ role: "user", content: `프로젝트: ${detail.book.title}\n\n${input}` }],
    text: { format: zodTextFormat(starSchema, "star_summary") },
  });
  const parsed = starSchema.safeParse(json);
  if (!parsed.success) throw new GeneralizeError("invalid", { cause: parsed.error });

  const draft = Object.fromEntries(STAR_FIELDS.map((field) => [field, toPart(parsed.data[field], idByRef)])) as StarDraft;
  await store.putStarDraft(bookId, draft, count, now);
}

/** Saves the reviewed text and records whether it differs from what the model wrote. */
export async function saveStar(store: DrawerWebStore, bookId: string, fields: StarFields): Promise<void> {
  const existing = await store.getStar(bookId);
  if (!existing) throw new StarError("not_found");
  await store.saveStar(bookId, fields, isEdited(existing.generated, fields));
}
