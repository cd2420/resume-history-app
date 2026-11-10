// Bookshelf types and pure helpers, shared by server code and route components.

export const NEW_SHELF_LABEL = "새로 꽂힌 책";
export const MAX_SHELF_NAME = 50;
/** Logs tagged per "fill tags" click. */
export const FILL_TAGS_BATCH = 20;

export interface Shelf {
  id: string;
  name: string;
  position: number;
}

export interface BookSummary {
  id: string;
  title: string;
  /** null = the "newly shelved" shelf. */
  shelfId: string | null;
  firstLog: string | null;
  lastLog: string | null;
  logCount: number;
  topTags: string[];
  isCurrent: boolean;
  createdAt: string;
}

export interface BookshelfView {
  shelves: Shelf[];
  books: BookSummary[];
  untaggedCount: number;
  tags: string[];
}

export interface BookLog {
  id: string;
  logDate: string;
  content: string;
  tags: string[];
  edited: boolean;
}

export interface BookDetail {
  book: BookSummary;
  logs: BookLog[];
}

/** Search conditions as they appear in the URL. Months are YYYY-MM. */
export interface SearchFilters {
  q: string | null;
  tag: string | null;
  from: string | null;
  to: string | null;
}

export interface SearchHit {
  logId: string;
  bookId: string;
  bookTitle: string;
  shelfName: string | null;
  logDate: string;
  content: string;
  tags: string[];
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseSearchFilters(params: URLSearchParams): SearchFilters {
  const text = (key: string, max: number) => {
    const value = params.get(key)?.trim();
    return value ? value.slice(0, max) : null;
  };
  const month = (key: string) => {
    const value = params.get(key);
    return value && MONTH_RE.test(value) ? value : null;
  };
  return { q: text("q", 100), tag: text("tag", 30), from: month("from"), to: month("to") };
}

export function hasFilters(filters: SearchFilters): boolean {
  return Boolean(filters.q || filters.tag || filters.from || filters.to);
}

/** "2026-02" -> first and last calendar day, as YYYY-MM-DD. */
export function monthBounds(from: string | null, to: string | null): { fromDate: string | null; toDate: string | null } {
  const lastDay = (month: string) => {
    const [year, m] = month.split("-").map(Number);
    return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
  };
  return { fromDate: from ? `${from}-01` : null, toDate: to ? lastDay(to) : null };
}

/** Current book first, then the most recently written, then the newest. */
export function sortBooks(books: readonly BookSummary[]): BookSummary[] {
  return [...books].sort(
    (a, b) =>
      Number(b.isCurrent) - Number(a.isCurrent) ||
      (b.lastLog ?? "").localeCompare(a.lastLog ?? "") ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

/** Groups newest-first logs by month (YYYY-MM), keeping order. */
export function groupByMonth<T extends { logDate: string }>(logs: readonly T[]): { month: string; logs: T[] }[] {
  const groups: { month: string; logs: T[] }[] = [];
  for (const log of logs) {
    const month = log.logDate.slice(0, 7);
    const last = groups.at(-1);
    if (last?.month === month) last.logs.push(log);
    else groups.push({ month, logs: [log] });
  }
  return groups;
}

/** A real YYYY-MM-DD that is not after `today` (KST). Web logs can be backfilled, not post-dated. */
export function isLoggableDate(date: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && date <= today;
}

/** "2025-03" ~ "진행 중" style period for a book cover. */
export function formatPeriod(book: Pick<BookSummary, "firstLog" | "lastLog" | "isCurrent">): string {
  const short = (date: string) => `${date.slice(2, 4)}.${date.slice(5, 7)}`;
  if (!book.firstLog) return "기록 없음";
  if (book.isCurrent) return `${short(book.firstLog)} ~`;
  const end = book.lastLog && book.lastLog.slice(0, 7) !== book.firstLog.slice(0, 7) ? short(book.lastLog) : "";
  return end ? `${short(book.firstLog)} ~ ${end}` : short(book.firstLog);
}
