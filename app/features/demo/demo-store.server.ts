import { kstDate } from "~/lib/kst";
import type { DrawerWebStore } from "~/features/drawer/drawer-web.server";
import { FakeDrawerRepo } from "~/features/drawer/fake-repo";
import { createLinkToken } from "~/features/drawer/link-token.server";
import type { ProjectDraft } from "~/features/interview/schema";
import { createFakeTelegram, type SentMessage } from "~/features/telegram/fake-telegram";
import type { InlineKeyboard } from "~/features/telegram/telegram.server";

export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000de00";
export const DEMO_TELEGRAM_USER_ID = 700_000_001;

export interface TranscriptEntry {
  id: number;
  from: "user" | "bot" | "system";
  text: string;
  keyboard?: InlineKeyboard;
  messageId?: number;
}

function daysAgo(days: number): string {
  return kstDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

/**
 * In-memory data for demo mode: the bot repo (FakeDrawerRepo), the web store, and a
 * transcript of what the fake Telegram client "sent", shown by the bot simulator.
 * Lives in one server process: a restart or another serverless instance starts fresh.
 */
export class DemoStore extends FakeDrawerRepo {
  consents = new Set<string>();
  transcript: TranscriptEntry[] = [];
  telegram = createFakeTelegram((message) => this.recordBot(message));
  private nextEntryId = 1;
  private nextUpdateId = 1;
  private projectCreatedAt = new Map<string, number>();

  constructor() {
    super();
    this.seed();
  }

  private seed() {
    const payments = this.addProject(DEMO_USER_ID, "결제 시스템 개편");
    const batch = this.addProject(DEMO_USER_ID, "정산 배치 안정화");
    this.currentProject.set(DEMO_USER_ID, payments.id);
    this.notifyHour.set(DEMO_USER_ID, 21);
    this.logs.push(
      { id: crypto.randomUUID(), userId: DEMO_USER_ID, projectId: payments.id, logDate: daysAgo(1), content: "대형 금융사 결제 승인 API의 응답 지연 원인을 찾아 캐시를 적용함", edited: false },
      { id: crypto.randomUUID(), userId: DEMO_USER_ID, projectId: payments.id, logDate: daysAgo(2), content: "결제 실패 재시도 정책을 지수 백오프로 바꾸고 알림 기준을 정리함", edited: true },
      { id: crypto.randomUUID(), userId: DEMO_USER_ID, projectId: batch.id, logDate: daysAgo(4), content: "정산 배치 실패 시 부분 재처리가 가능하도록 청크 단위 커밋으로 변경", edited: false },
    );
  }

  override addProject(userId: string, title: string) {
    const project = super.addProject(userId, title);
    this.projectCreatedAt.set(project.id, this.projectCreatedAt.size);
    return project;
  }

  nextUpdate(): number {
    return this.nextUpdateId++;
  }

  addEntry(from: TranscriptEntry["from"], text: string) {
    this.transcript.push({ id: this.nextEntryId++, from, text });
  }

  private recordBot(message: SentMessage) {
    if (message.method === "sendMessage") {
      this.transcript.push({
        id: this.nextEntryId++,
        from: "bot",
        text: message.text ?? "",
        keyboard: message.keyboard,
        messageId: message.messageId,
      });
    } else if (message.method === "editMessageText") {
      const entry = this.transcript.find((e) => e.messageId === message.messageId);
      if (entry) {
        entry.text = message.text ?? entry.text;
        entry.keyboard = message.keyboard?.length ? message.keyboard : undefined;
      }
    } else if (message.text) {
      this.addEntry("system", `알림: ${message.text}`);
    }
  }

  addDraftProject(userId: string, draft: ProjectDraft) {
    const project = this.addProject(userId, draft.project.title);
    if (!this.currentProject.has(userId)) this.currentProject.set(userId, project.id);
  }

  webStoreFor(userId: string): DrawerWebStore {
    const owned = (projectId: string) => this.projects.find((p) => p.id === projectId && p.userId === userId);
    const ownedLog = (logId: string) => this.logs.find((l) => l.id === logId && l.userId === userId);
    return {
      hasRequiredConsents: async () => this.consents.has(userId),
      recordConsents: async () => {
        this.consents.add(userId);
      },
      getOverview: async () => {
        const link = this.links.find((l) => l.userId === userId);
        return {
          notifyHour: this.notifyHour.get(userId) ?? null,
          currentProjectId: this.currentProject.get(userId) ?? null,
          telegram: link ? { linkedAt: new Date().toISOString(), blocked: link.blocked } : null,
          projects: this.projects
            .filter((p) => p.userId === userId)
            .sort((a, b) => (this.projectCreatedAt.get(b.id) ?? 0) - (this.projectCreatedAt.get(a.id) ?? 0))
            .map(({ id, title }) => ({ id, title })),
          logs: this.logs
            .filter((l) => l.userId === userId && l.id)
            .sort((a, b) => b.logDate.localeCompare(a.logDate))
            .map((l) => ({
              id: l.id!,
              project_id: l.projectId,
              log_date: l.logDate,
              content: l.content,
              edited: l.edited,
              source: "telegram" as const,
            })),
        };
      },
      issueLinkToken: async () => {
        const { token, tokenHash } = createLinkToken();
        this.tokens.set(tokenHash, { userId, used: false, expired: false });
        return token;
      },
      unlinkTelegram: async () => {
        this.links = this.links.filter((l) => l.userId !== userId);
      },
      setNotifyHour: async (hour) => {
        if (hour === null) this.notifyHour.delete(userId);
        else this.notifyHour.set(userId, hour);
      },
      createProject: async (title) => {
        const project = this.addProject(userId, title);
        if (!this.currentProject.has(userId)) this.currentProject.set(userId, project.id);
      },
      renameProject: async (projectId, title) => {
        const project = owned(projectId);
        if (project) project.title = title;
      },
      setCurrentProject: async (projectId) => {
        if (owned(projectId)) this.currentProject.set(userId, projectId);
      },
      updateLog: async (logId, content) => {
        const log = ownedLog(logId);
        if (log) Object.assign(log, { content, edited: true });
      },
      deleteLog: async (logId) => {
        this.logs = this.logs.filter((l) => !(l.id === logId && l.userId === userId));
      },
    };
  }
}

// globalThis keeps one store across dev-server module reloads.
const holder = globalThis as unknown as { __drawerDemoStore?: DemoStore };

export function getDemoStore(): DemoStore {
  holder.__drawerDemoStore ??= new DemoStore();
  return holder.__drawerDemoStore;
}

export function resetDemoStore(): DemoStore {
  holder.__drawerDemoStore = new DemoStore();
  return holder.__drawerDemoStore;
}
