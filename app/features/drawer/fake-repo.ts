import { randomUUID } from "node:crypto";

import type { UserRole } from "./roles";
import type { DrawerRepo, NotificationStatus, Pending, ProjectSummary, RecordSession, SessionPatch } from "./repo";

export interface FakeSession extends RecordSession {
  status: "open" | "carded" | "cancelled" | "expired";
  source: "notify" | "user";
  expiresAt: Date;
}

interface Link {
  userId: string;
  telegramUserId: number;
  chatId: number;
  blocked: boolean;
}

export interface FakeLog {
  id?: string;
  tags?: string[];
  userId: string;
  projectId: string;
  logDate: string;
  content: string;
  edited: boolean;
}

/** In-memory DrawerRepo mirroring the SQL functions' semantics (tests only). */
export class FakeDrawerRepo implements DrawerRepo {
  updates = new Set<number>();
  tokens = new Map<string, { userId: string; used: boolean; expired: boolean }>();
  links: Link[] = [];
  /** Telegram user id -> the account it left. Mirrors private.telegram_unlinks; the fake never reaches KST midnight. */
  unlinks = new Map<number, string>();
  projects: (ProjectSummary & { userId: string; shelfId?: string | null; createdAt?: number })[] = [];
  currentProject = new Map<string, string>();
  /** Project ids with a STAR summary (projects.ended_at set). */
  ended = new Set<string>();
  notifyHour = new Map<string, number>();
  pendings: Pending[] = [];
  logs: FakeLog[] = [];
  notifications = new Map<string, NotificationStatus | "sending">();
  sessions: FakeSession[] = [];

  addProject(userId: string, title: string): ProjectSummary {
    const project = { id: randomUUID(), title, userId, shelfId: null, createdAt: this.projects.length };
    this.projects.push(project);
    return { id: project.id, title };
  }

  async recordUpdate(updateId: number) {
    if (this.updates.has(updateId)) return false;
    this.updates.add(updateId);
    return true;
  }

  async linkTelegram(tokenHash: string, telegramUserId: number, chatId: number) {
    const token = this.tokens.get(tokenHash);
    if (!token || token.used || token.expired) return "invalid" as const;
    if (this.links.some((l) => l.telegramUserId === telegramUserId && l.userId !== token.userId)) {
      return "telegram_taken" as const;
    }
    const leftUser = this.unlinks.get(telegramUserId);
    if (leftUser !== undefined && leftUser !== token.userId) return "telegram_cooldown" as const;
    const previous = this.links.find((l) => l.userId === token.userId);
    if (previous && previous.telegramUserId !== telegramUserId) this.unlinks.set(previous.telegramUserId, previous.userId);
    this.links = this.links.filter((l) => l.userId !== token.userId);
    this.links.push({ userId: token.userId, telegramUserId, chatId, blocked: false });
    token.used = true;
    return "linked" as const;
  }

  /** Unlink as the DB trigger sees it: the Telegram account is remembered until KST midnight. */
  removeLink(userId: string): void {
    const link = this.links.find((l) => l.userId === userId);
    if (link) this.unlinks.set(link.telegramUserId, userId);
    this.links = this.links.filter((l) => l.userId !== userId);
  }

  async findLinkByTelegramUser(telegramUserId: number) {
    const link = this.links.find((l) => l.telegramUserId === telegramUserId);
    return link ? { userId: link.userId, chatId: link.chatId, blocked: link.blocked } : null;
  }

  async clearBlocked(userId: string) {
    this.links.filter((l) => l.userId === userId).forEach((l) => (l.blocked = false));
  }

  async markBlocked(userId: string) {
    this.links.filter((l) => l.userId === userId).forEach((l) => (l.blocked = true));
  }

  private owned(userId: string, projectId: string) {
    return this.projects.find((p) => p.id === projectId && p.userId === userId);
  }

  async getCurrentProject(userId: string) {
    const id = this.currentProject.get(userId);
    return id ? this.getProject(userId, id) : null;
  }

  async listProjects(userId: string) {
    return this.projects
      .filter((p) => p.userId === userId && !this.ended.has(p.id))
      .map(({ id, title }) => ({ id, title }));
  }

  async getProject(userId: string, projectId: string) {
    const p = this.owned(userId, projectId);
    return p ? { id: p.id, title: p.title } : null;
  }

  async listTags(userId: string) {
    const recent = [...this.logs].reverse().filter((log) => log.userId === userId);
    return [...new Set(recent.flatMap((log) => log.tags ?? []))];
  }

  async createProject(userId: string, title: string) {
    return this.addProject(userId, title);
  }

  async setCurrentProject(userId: string, projectId: string) {
    if (!this.owned(userId, projectId)) return false;
    this.currentProject.set(userId, projectId);
    return true;
  }

  async createPending(userId: string, input: Parameters<DrawerRepo["createPending"]>[1]) {
    const pending: Pending = { id: randomUUID(), userId, state: "confirm", cardMessageId: null, ...input };
    this.pendings.push(pending);
    return { ...pending };
  }

  private findPending(userId: string, pendingId: string) {
    return this.pendings.find((p) => p.id === pendingId && p.userId === userId);
  }

  async getPending(userId: string, pendingId: string) {
    const p = this.findPending(userId, pendingId);
    return p ? { ...p } : null;
  }

  async getEditingPending(userId: string) {
    const p = this.pendings.find((x) => x.userId === userId && x.state === "edit");
    return p ? { ...p } : null;
  }

  async setCardMessage(userId: string, pendingId: string, messageId: number) {
    const p = this.findPending(userId, pendingId);
    if (p) p.cardMessageId = messageId;
  }

  async movePending(userId: string, pendingId: string, projectId: string) {
    const p = this.findPending(userId, pendingId);
    if (!p || !this.owned(userId, projectId)) return false;
    p.projectId = projectId;
    return true;
  }

  async startEditing(userId: string, pendingId: string) {
    for (const p of this.pendings) {
      if (p.userId === userId) p.state = p.id === pendingId ? "edit" : "confirm";
    }
  }

  async deletePending(userId: string, pendingId: string) {
    this.pendings = this.pendings.filter((p) => !(p.id === pendingId && p.userId === userId));
  }

  async savePendingAsLog(userId: string, pendingId: string, content: string, edited: boolean, logDate: string) {
    const p = this.findPending(userId, pendingId);
    if (!p) return false;
    this.pendings = this.pendings.filter((x) => x !== p);
    this.logs.push({ id: randomUUID(), userId, projectId: p.projectId, logDate, content, edited, tags: [...p.tags] });
    return true;
  }

  roles = new Map<string, UserRole>();

  async getRole(userId: string): Promise<UserRole> {
    return this.roles.get(userId) ?? "user";
  }

  /** Stands in for the database clock; tests point it at their fake "now". */
  clock: () => Date = () => new Date();

  async openSession(userId: string, input: Parameters<DrawerRepo["openSession"]>[1]) {
    const now = this.clock();
    for (const s of this.sessions) {
      if (s.userId === userId && s.status === "open" && s.expiresAt <= now) s.status = "expired";
    }
    const open = this.sessions.find((s) => s.userId === userId && s.status === "open");
    if (open) return { outcome: "exists" as const, session: { ...open } };
    const today = this.sessions.filter((s) => s.userId === userId && s.kstDate === input.kstDate).length;
    if (input.dailyLimit !== null && today >= input.dailyLimit) {
      return { outcome: "limit" as const, session: null };
    }
    if (!this.owned(userId, input.projectId)) throw new Error("foreign project");
    const session: FakeSession = {
      id: randomUUID(),
      userId,
      projectId: input.projectId,
      chatId: input.chatId,
      kstDate: input.kstDate,
      source: input.source,
      expiresAt: input.expiresAt,
      status: "open",
      step: 1,
      task: null,
      role: null,
      result: null,
      changes: [],
      tags: [],
      aiCalls: 0,
    };
    this.sessions.push(session);
    return { outcome: "opened" as const, session: { ...session } };
  }

  async getOpenSession(userId: string, now: Date) {
    const s = this.sessions.find((x) => x.userId === userId && x.status === "open" && x.expiresAt > now);
    return s ? { ...s } : null;
  }

  async updateSession(userId: string, sessionId: string, patch: SessionPatch) {
    const s = this.sessions.find((x) => x.id === sessionId && x.userId === userId);
    if (s) Object.assign(s, patch);
  }

  async listDueNotifications(hour: number, kstDate: string) {
    return this.links
      .filter((l) => !l.blocked && this.notifyHour.get(l.userId) === hour)
      .filter((l) => !this.sessions.some((s) => s.userId === l.userId && s.kstDate === kstDate && s.status === "open"))
      .filter((l) => !this.logs.some((log) => log.userId === l.userId && log.logDate === kstDate))
      .filter((l) => !this.notifications.has(`${l.userId}:${kstDate}`))
      .map((l) => ({ userId: l.userId, chatId: l.chatId }));
  }

  async claimNotification(userId: string, kstDate: string) {
    const key = `${userId}:${kstDate}`;
    if (this.notifications.has(key)) return false;
    this.notifications.set(key, "sending");
    return true;
  }

  async setNotificationStatus(userId: string, kstDate: string, status: NotificationStatus) {
    this.notifications.set(`${userId}:${kstDate}`, status);
  }
}
