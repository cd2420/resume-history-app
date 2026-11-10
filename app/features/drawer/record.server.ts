// Recording sessions: the only place answers reach the AI.
// A session opens on the hourly prompt or when the user asks to record, asks three fixed
// questions (no AI), generalizes each answer as it arrives (raw text is never stored), and
// ends with one confirmation card built from the three generalized answers.

import { kstDate, kstNextMidnight } from "~/lib/kst";
import type { TelegramClient } from "~/features/telegram/telegram.server";
import { type DrawerLlmClient, generalize, GeneralizeError } from "./generalize.server";
import { ANSWER_MAX_LENGTH, DAILY_SESSION_LIMIT, MAX_LOG_LENGTH, SESSION_AI_CALL_LIMIT } from "./limits";
import { cardKeyboard, MESSAGES, QUESTIONS, questionKeyboard, renderCard } from "./messages";
import type { DrawerRepo, OpenSessionOutcome, RecordSession, SessionPatch, SessionStep } from "./repo";
import { normalizeTags } from "./tags";
import { isUnlimited } from "./roles";

export interface RecordDeps {
  repo: DrawerRepo;
  telegram: TelegramClient;
  now: () => Date;
}

export interface AnswerDeps extends RecordDeps {
  llm: DrawerLlmClient;
}

export type OpenOutcome = OpenSessionOutcome | "no_project";

/** Opens (or resumes) a session for the user's current book and asks the right question. */
export async function openRecording(
  { repo, telegram, now }: RecordDeps,
  userId: string,
  chatId: number,
  source: "notify" | "user",
): Promise<OpenOutcome> {
  const project = await repo.getCurrentProject(userId);
  if (!project) {
    await telegram.sendMessage(chatId, MESSAGES.noProject);
    return "no_project";
  }
  const at = now();
  const role = await repo.getRole(userId);
  const { outcome, session } = await repo.openSession(userId, {
    projectId: project.id,
    chatId,
    kstDate: kstDate(at),
    source,
    expiresAt: kstNextMidnight(at),
    dailyLimit: isUnlimited(role) ? null : DAILY_SESSION_LIMIT,
  });
  if (outcome === "limit" || !session) {
    await telegram.sendMessage(chatId, MESSAGES.dailyLimit);
    return "limit";
  }
  if (outcome === "exists") {
    await telegram.sendMessage(
      chatId,
      `${MESSAGES.sessionResume}\n\n${QUESTIONS[session.step]}`,
      questionKeyboard(session.step, session.id),
    );
    return "exists";
  }
  await telegram.sendMessage(
    chatId,
    source === "notify" ? MESSAGES.sessionNotify(project.title) : MESSAGES.sessionUser(project.title),
  );
  return "opened";
}

const FIELD: Record<SessionStep, "task" | "role" | "result"> = { 1: "task", 2: "role", 3: "result" };

/** One log text from the three generalized answers; skipped answers are left out. */
export function composeLog(parts: Pick<RecordSession, "task" | "role" | "result">): string {
  const lines = [parts.task ?? ""];
  if (parts.role) lines.push(`· 내 역할·이유: ${parts.role}`);
  if (parts.result) lines.push(`· 결과: ${parts.result}`);
  const text = lines.join("\n").trim();
  return text.length > MAX_LOG_LENGTH ? `${text.slice(0, MAX_LOG_LENGTH - 1)}…` : text;
}

async function advance(deps: RecordDeps, session: RecordSession, patch: SessionPatch) {
  const updated = { ...session, ...patch };
  if (session.step < 3) {
    const next = (session.step + 1) as SessionStep;
    await deps.repo.updateSession(session.userId, session.id, { ...patch, step: next });
    await deps.telegram.sendMessage(session.chatId, QUESTIONS[next], questionKeyboard(next, session.id));
    return;
  }
  await deps.repo.updateSession(session.userId, session.id, patch);
  await finish(deps, updated);
}

async function finish({ repo, telegram }: RecordDeps, session: RecordSession) {
  const pending = await repo.createPending(session.userId, {
    projectId: session.projectId,
    generalized: composeLog(session),
    changes: session.changes,
    tags: session.tags,
    chatId: session.chatId,
  });
  const project = await repo.getProject(session.userId, session.projectId);
  const sent = await telegram.sendMessage(session.chatId, renderCard(pending, project), cardKeyboard(pending.id));
  await repo.setCardMessage(session.userId, pending.id, sent.messageId);
  await repo.updateSession(session.userId, session.id, { status: "carded" });
}

/**
 * Generalizes one answer and moves to the next question. `text` is raw: it goes to the AI
 * once and is never stored or logged.
 */
export async function answerQuestion(deps: AnswerDeps, session: RecordSession, text: string): Promise<void> {
  const { repo, telegram } = deps;
  if (text.length > ANSWER_MAX_LENGTH) {
    await telegram.sendMessage(session.chatId, MESSAGES.answerTooLong);
    return;
  }
  // The role is only looked up once the free-tier cap is reached.
  if (session.aiCalls >= SESSION_AI_CALL_LIMIT && !isUnlimited(await repo.getRole(session.userId))) {
    await repo.updateSession(session.userId, session.id, { status: "cancelled" });
    await telegram.sendMessage(session.chatId, MESSAGES.aiLimit);
    return;
  }

  // Count the attempt before calling, so failures and retries are capped too.
  const aiCalls = session.aiCalls + 1;
  await repo.updateSession(session.userId, session.id, { aiCalls });
  let result;
  try {
    const existing = await repo.listTags(session.userId);
    result = await generalize(deps.llm, text, [...session.tags, ...existing]);
  } catch (error) {
    if (!(error instanceof GeneralizeError)) throw error;
    console.error("generalize failed", error.reason);
    await telegram.sendMessage(session.chatId, MESSAGES.generalizeFailed);
    return;
  }

  await advance(deps, { ...session, aiCalls }, {
    aiCalls,
    [FIELD[session.step]]: result.generalized,
    changes: [...new Set([...session.changes, ...result.changes])],
    tags: normalizeTags([...session.tags, ...result.tags]),
  });
}

/** Skips an optional question (2 and 3). Returns false if there is nothing to skip. */
export async function skipQuestion(deps: RecordDeps, session: RecordSession): Promise<boolean> {
  if (session.step === 1) return false;
  await advance(deps, session, { [FIELD[session.step]]: null });
  return true;
}
