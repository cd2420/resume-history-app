import { kstDate } from "~/lib/kst";
import {
  type BookLog,
  type BookSummary,
  monthBounds,
  type Shelf,
  sortBooks,
} from "~/features/drawer/bookshelf";
import type { ConsentTerm } from "~/features/drawer/consent";
import type { DrawerWebStore } from "~/features/drawer/drawer-web.server";
import { draftFields, type StarSummary } from "~/features/drawer/star";
import { FakeDrawerRepo } from "~/features/drawer/fake-repo";
import { createLinkToken } from "~/features/drawer/link-token.server";
import { normalizeTags, topTags } from "~/features/drawer/tags";
import type { ProjectDraft } from "~/features/interview/schema";
import { createFakeTelegram, type SentMessage } from "~/features/telegram/fake-telegram";
import type { InlineKeyboard } from "~/features/telegram/telegram.server";

// Demo stand-in for public.consent_terms (production reads the text from the database).
const DEMO_CONSENT_TERMS: ConsentTerm[] = [
  {
    kind: "privacy",
    version: "demo",
    title: "[필수] 개인정보 수집·이용",
    items: ["데모 모드에서는 입력한 내용이 메모리에만 있고 서버를 다시 켜면 사라져요."],
  },
  {
    kind: "overseas_transfer",
    version: "demo",
    title: "[필수] 개인정보 국외 이전",
    items: ["데모 모드에서는 OpenAI로 보내지 않고 가짜 일반화를 써요."],
  },
];

const DEMO_TELEGRAM_TERM: ConsentTerm = {
  kind: "telegram",
  version: "demo",
  title: "[필수] 텔레그램 연결을 위한 개인정보 수집·이용",
  items: ["데모 모드에서는 실제 텔레그램 대신 봇 시뮬레이터를 써요."],
};

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
  stars = new Map<string, StarSummary>();
  transcript: TranscriptEntry[] = [];
  telegram = createFakeTelegram((message) => this.recordBot(message));
  private nextEntryId = 1;
  private nextUpdateId = 1;

  constructor() {
    super();
    this.seed();
  }

  private seed() {
    const company = this.addShelf(DEMO_USER_ID, "A사");
    const personal = this.addShelf(DEMO_USER_ID, "개인 프로젝트");
    const payments = this.addProject(DEMO_USER_ID, "결제 시스템 개편");
    const batch = this.addProject(DEMO_USER_ID, "정산 배치 안정화");
    const blog = this.addProject(DEMO_USER_ID, "개인 블로그");
    const hackathon = this.addProject(DEMO_USER_ID, "사내 해커톤");
    this.shelveBook(payments.id, company.id);
    this.shelveBook(batch.id, company.id);
    this.shelveBook(blog.id, personal.id);
    // hackathon stays on the "newly shelved" shelf, as if just created from the bot.
    this.currentProject.set(DEMO_USER_ID, payments.id);
    this.notifyHour.set(DEMO_USER_ID, 21);

    const log = (projectId: string, days: number, content: string, tags: string[], edited = false) =>
      this.logs.push({ id: crypto.randomUUID(), userId: DEMO_USER_ID, projectId, logDate: daysAgo(days), content, edited, tags });
    log(payments.id, 1, "대형 금융사 결제 승인 API의 응답 지연 원인을 찾아 캐시를 적용함", ["Redis", "캐시", "성능 개선"]);
    log(payments.id, 2, "결제 실패 재시도 정책을 지수 백오프로 바꾸고 알림 기준을 정리함", ["장애 대응", "결제"], true);
    log(payments.id, 9, "결제 완료 이벤트를 Kafka로 비동기 발행하도록 바꿈", ["Kafka", "비동기 처리"]);
    log(payments.id, 25, "피크 시간대 결제 요청을 파티션 확장으로 분산 처리함", ["Kafka", "대용량 트래픽"]);
    log(payments.id, 40, "결제 승인 모듈을 Spring Boot 3로 이전함", ["Spring Boot", "결제"]);
    log(payments.id, 55, "코드 리뷰 체크리스트를 정리해 팀에 공유함", []);
    log(payments.id, 70, "결제 도메인 모델을 승인·취소·환불로 나눠 설계함", ["설계", "결제"]);
    log(batch.id, 120, "정산 배치 실패 시 부분 재처리가 가능하도록 청크 단위 커밋으로 변경", ["Spring Batch", "장애 대응"]);
    log(batch.id, 150, "정산 배치 실행 시간을 병렬 스텝으로 크게 줄임", ["Spring Batch", "성능 개선"]);
    log(blog.id, 30, "CDN 캐시 설정으로 블로그 첫 화면 로딩을 개선함", ["Next.js", "CDN", "성능 개선"]);
    log(blog.id, 95, "블로그를 Next.js 정적 생성으로 옮김", ["Next.js"]);
    log(hackathon.id, 5, "사내 문서 검색 봇 프로토타입을 만듦", []);
  }

  shelves: (Shelf & { userId: string })[] = [];

  private addShelf(userId: string, name: string): Shelf {
    const position = this.shelves.filter((s) => s.userId === userId).reduce((max, s) => Math.max(max, s.position), -1) + 1;
    const shelf = { id: crypto.randomUUID(), userId, name, position };
    this.shelves.push(shelf);
    return shelf;
  }

  private shelveBook(projectId: string, shelfId: string | null) {
    const project = this.projects.find((p) => p.id === projectId);
    if (project) project.shelfId = shelfId;
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

  private bookSummary(userId: string, project: (typeof this.projects)[number]): BookSummary {
    const logs = this.logs
      .filter((l) => l.userId === userId && l.projectId === project.id)
      .map((l) => ({ logDate: l.logDate, tags: l.tags ?? [] }))
      .sort((a, b) => a.logDate.localeCompare(b.logDate));
    return {
      id: project.id,
      title: project.title,
      shelfId: project.shelfId ?? null,
      firstLog: logs[0]?.logDate ?? null,
      lastLog: logs.at(-1)?.logDate ?? null,
      logCount: logs.length,
      topTags: topTags(logs),
      isCurrent: this.currentProject.get(userId) === project.id,
      createdAt: new Date(Date.UTC(2026, 0, 1) + (project.createdAt ?? 0) * 1000).toISOString(),
    };
  }

  private tagsOf(userId: string): string[] {
    return [...new Set([...this.logs].reverse().filter((l) => l.userId === userId).flatMap((l) => l.tags ?? []))];
  }

  webStoreFor(userId: string): DrawerWebStore {
    const owned = (projectId: string) => this.projects.find((p) => p.id === projectId && p.userId === userId);
    const ownedLog = (logId: string) => this.logs.find((l) => l.id === logId && l.userId === userId);
    const ownedShelves = () =>
      this.shelves.filter((s) => s.userId === userId).sort((a, b) => a.position - b.position);
    const toShelf = ({ id, name, position }: Shelf) => ({ id, name, position });
    return {
      getBookshelf: async () => ({
        shelves: ownedShelves().map(toShelf),
        books: sortBooks(this.projects.filter((p) => p.userId === userId).map((p) => this.bookSummary(userId, p))),
        untaggedCount: this.logs.filter((l) => l.userId === userId && !(l.tags ?? []).length).length,
        tags: this.tagsOf(userId),
      }),
      search: async (filters) => {
        const { fromDate, toDate } = monthBounds(filters.from, filters.to);
        const q = filters.q?.toLowerCase();
        const tag = filters.tag?.toLowerCase();
        return this.logs
          .filter((l) => l.userId === userId && l.id)
          .map((l) => ({ log: l, book: owned(l.projectId) }))
          .filter(({ log, book }) => {
            const tags = (log.tags ?? []).map((t) => t.toLowerCase());
            if (!book) return false;
            if (q && !log.content.toLowerCase().includes(q) && !book.title.toLowerCase().includes(q) && !tags.includes(q)) return false;
            if (tag && !tags.includes(tag)) return false;
            if (fromDate && log.logDate < fromDate) return false;
            if (toDate && log.logDate > toDate) return false;
            return true;
          })
          .sort((a, b) => b.log.logDate.localeCompare(a.log.logDate))
          .slice(0, 200)
          .map(({ log, book }) => ({
            logId: log.id!,
            bookId: book!.id,
            bookTitle: book!.title,
            shelfName: this.shelves.find((s) => s.id === book!.shelfId)?.name ?? null,
            logDate: log.logDate,
            content: log.content,
            tags: log.tags ?? [],
          }));
      },
      getBook: async (bookId) => {
        const project = owned(bookId);
        if (!project) return null;
        const logs: BookLog[] = this.logs
          .filter((l) => l.userId === userId && l.projectId === bookId && l.id)
          .sort((a, b) => b.logDate.localeCompare(a.logDate))
          .map((l) => ({ id: l.id!, logDate: l.logDate, content: l.content, tags: l.tags ?? [], edited: l.edited }));
        return { book: this.bookSummary(userId, project), logs };
      },
      createShelf: async (name) => {
        this.addShelf(userId, name);
      },
      renameShelf: async (shelfId, name) => {
        const shelf = ownedShelves().find((s) => s.id === shelfId);
        if (shelf) shelf.name = name;
      },
      moveShelf: async (shelfId, direction) => {
        const shelves = ownedShelves();
        const index = shelves.findIndex((s) => s.id === shelfId);
        const otherIndex = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || !shelves[otherIndex]) return;
        [shelves[index], shelves[otherIndex]] = [shelves[otherIndex], shelves[index]];
        shelves.forEach((shelf, position) => (shelf.position = position));
      },
      deleteShelf: async (shelfId) => {
        if (!ownedShelves().some((s) => s.id === shelfId)) return;
        this.shelves = this.shelves.filter((s) => s.id !== shelfId);
        this.projects.filter((p) => p.shelfId === shelfId).forEach((p) => (p.shelfId = null));
      },
      moveBook: async (bookId, shelfId) => {
        const project = owned(bookId);
        if (!project || (shelfId && !ownedShelves().some((s) => s.id === shelfId))) return;
        project.shelfId = shelfId;
      },
      updateLogTags: async (logId, tags) => {
        const log = ownedLog(logId);
        if (log) log.tags = normalizeTags(tags);
      },
      listUntaggedLogs: async (limit) =>
        this.logs
          .filter((l) => l.userId === userId && l.id && !(l.tags ?? []).length)
          .slice(0, limit)
          .map((l) => ({ id: l.id!, content: l.content })),
      listTags: async () => this.tagsOf(userId),

      getConsentTerms: async () => DEMO_CONSENT_TERMS,
      hasRequiredConsents: async () => this.consents.has(userId),
      recordConsents: async () => {
        this.consents.add(userId);
      },
      getTelegramTerm: async () => DEMO_TELEGRAM_TERM,
      ensureConsent: async () => {},
      getOverview: async () => {
        const link = this.links.find((l) => l.userId === userId);
        return {
          notifyHour: this.notifyHour.get(userId) ?? null,
          currentProjectId: this.currentProject.get(userId) ?? null,
          telegram: link ? { linkedAt: new Date().toISOString(), blocked: link.blocked } : null,
          projects: this.projects
            .filter((p) => p.userId === userId)
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
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
        this.removeLink(userId);
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
      getStar: async (projectId) => (owned(projectId) ? (this.stars.get(projectId) ?? null) : null),
      putStarDraft: async (projectId, draft, generationCount) => {
        const project = owned(projectId);
        if (!project) return;
        const generatedAt = new Date().toISOString();
        this.stars.set(projectId, { generated: draft, fields: draftFields(draft), status: "draft", edited: false, generationCount, generatedAt, savedAt: null });
        this.ended.add(projectId);
        if (this.currentProject.get(userId) === projectId) this.currentProject.delete(userId);
      },
      saveStar: async (projectId, fields, edited) => {
        const star = owned(projectId) ? this.stars.get(projectId) : undefined;
        if (star) this.stars.set(projectId, { ...star, fields, status: "saved", edited, savedAt: new Date().toISOString() });
      },
      createLog: async (projectId, logDate, content) => {
        if (!owned(projectId)) return;
        this.logs.push({ id: crypto.randomUUID(), userId, projectId, logDate, content, edited: false, tags: [] });
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
