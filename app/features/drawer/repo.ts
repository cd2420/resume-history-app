// Storage contract for the Telegram bot and the hourly notifier. Every method that reads
// or writes user data takes the owning userId, which the caller must have resolved from
// telegram_links. The implementation (drawer.server.ts) uses the RLS-bypassing secret key.

import type { ChangeCategory } from "./generalize.server";
import type { UserRole } from "./roles";

export interface TelegramLink {
  userId: string;
  chatId: number;
  blocked: boolean;
}

export interface ProjectSummary {
  id: string;
  title: string;
}

export interface Pending {
  id: string;
  userId: string;
  projectId: string;
  generalized: string;
  changes: ChangeCategory[];
  tags: string[];
  state: "confirm" | "edit";
  chatId: number;
  cardMessageId: number | null;
}

export type SessionStep = 1 | 2 | 3;

/** One recording session: three questions, each answer stored already generalized. */
export interface RecordSession {
  id: string;
  userId: string;
  projectId: string;
  chatId: number;
  kstDate: string;
  step: SessionStep;
  task: string | null;
  role: string | null;
  result: string | null;
  changes: ChangeCategory[];
  tags: string[];
  aiCalls: number;
}

export type SessionPatch = Partial<Pick<RecordSession, "step" | "task" | "role" | "result" | "changes" | "tags" | "aiCalls">> & {
  status?: "carded" | "cancelled";
};

export type OpenSessionOutcome = "opened" | "exists" | "limit";

/** telegram_cooldown: this Telegram account left a different account today (unlink or account deletion). */
export type LinkResult = "linked" | "invalid" | "telegram_taken" | "telegram_cooldown";
export type NotificationStatus = "sent" | "failed" | "blocked";

export interface DueNotification {
  userId: string;
  chatId: number;
}

export interface DrawerRepo {
  /** Returns false when this update_id was already handled. */
  recordUpdate(updateId: number): Promise<boolean>;
  linkTelegram(tokenHash: string, telegramUserId: number, chatId: number): Promise<LinkResult>;
  findLinkByTelegramUser(telegramUserId: number): Promise<TelegramLink | null>;
  clearBlocked(userId: string): Promise<void>;
  markBlocked(userId: string): Promise<void>;

  /** The user's tier from profiles.role; "user" when the profile is missing. */
  getRole(userId: string): Promise<UserRole>;
  getCurrentProject(userId: string): Promise<ProjectSummary | null>;
  listProjects(userId: string): Promise<ProjectSummary[]>;
  getProject(userId: string, projectId: string): Promise<ProjectSummary | null>;
  /** The user's tags, most recently used first, so the model can reuse their spelling. */
  listTags(userId: string): Promise<string[]>;
  createProject(userId: string, title: string): Promise<ProjectSummary>;
  /** Returns false when the project does not belong to the user. */
  setCurrentProject(userId: string, projectId: string): Promise<boolean>;

  createPending(
    userId: string,
    input: { projectId: string; generalized: string; changes: ChangeCategory[]; tags: string[]; chatId: number },
  ): Promise<Pending>;
  /** Unexpired card owned by the user, or null. */
  getPending(userId: string, pendingId: string): Promise<Pending | null>;
  /** The card the user is currently rewriting, or null. */
  getEditingPending(userId: string): Promise<Pending | null>;
  setCardMessage(userId: string, pendingId: string, messageId: number): Promise<void>;
  /** Returns false when the project does not belong to the user. */
  movePending(userId: string, pendingId: string, projectId: string): Promise<boolean>;
  /** Puts this card into edit state and every other card of the user back to confirm. */
  startEditing(userId: string, pendingId: string): Promise<void>;
  deletePending(userId: string, pendingId: string): Promise<void>;
  /** Atomically turns the card into a daily log. Returns false if the card is gone. */
  savePendingAsLog(userId: string, pendingId: string, content: string, edited: boolean, logDate: string): Promise<boolean>;

  /** Closes an expired open session, reuses an open one, enforces the daily limit. */
  openSession(
    userId: string,
    // dailyLimit null = no daily cap (admins).
    input: { projectId: string; chatId: number; kstDate: string; source: "notify" | "user"; expiresAt: Date; dailyLimit: number | null },
  ): Promise<{ outcome: OpenSessionOutcome; session: RecordSession | null }>;
  /** The user's open, unexpired session, or null. */
  getOpenSession(userId: string, now: Date): Promise<RecordSession | null>;
  updateSession(userId: string, sessionId: string, patch: SessionPatch): Promise<void>;

  listDueNotifications(hour: number, kstDate: string): Promise<DueNotification[]>;
  /** Inserts today's notification row. Returns false if one already exists. */
  claimNotification(userId: string, kstDate: string): Promise<boolean>;
  setNotificationStatus(userId: string, kstDate: string, status: NotificationStatus): Promise<void>;
}
