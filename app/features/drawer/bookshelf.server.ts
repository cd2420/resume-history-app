import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type BookDetail,
  type BookLog,
  type BookshelfView,
  type BookSummary,
  monthBounds,
  type SearchFilters,
  type SearchHit,
  type Shelf,
  sortBooks,
} from "./bookshelf";
import { DrawerWebError } from "./drawer-web.server";
import { normalizeTags, topTags } from "./tags";

/** Bookshelf operations bound to one signed-in user (Supabase + RLS, or demo memory). */
export interface BookshelfStore {
  getBookshelf(): Promise<BookshelfView>;
  /** Just the shelves, for screens that need the shelf names but not the whole bookshelf. */
  listShelves(): Promise<Shelf[]>;
  search(filters: SearchFilters): Promise<SearchHit[]>;
  getBook(bookId: string): Promise<BookDetail | null>;
  createShelf(name: string): Promise<void>;
  renameShelf(shelfId: string, name: string): Promise<void>;
  moveShelf(shelfId: string, direction: "up" | "down"): Promise<void>;
  deleteShelf(shelfId: string): Promise<void>;
  /** null puts the book back on the "newly shelved" shelf. */
  moveBook(bookId: string, shelfId: string | null): Promise<void>;
  updateLogTags(logId: string, tags: string[]): Promise<void>;
  listTags(): Promise<string[]>;
}

const RECENT_LOGS_FOR_TAGS = 500;

type DbResult<T> = { data: T | null; error: { code?: string } | null };

function check<T>(operation: string, result: DbResult<T>): T {
  if (result.error || result.data === null) throw new DrawerWebError(operation, result.error?.code ?? "no_data");
  return result.data;
}

function checkWrite(operation: string, result: { error: { code?: string } | null }): void {
  if (result.error) throw new DrawerWebError(operation, result.error.code);
}

interface BookshelfRow {
  book_id: string;
  title: string;
  shelf_id: string | null;
  first_log: string | null;
  last_log: string | null;
  log_count: number;
  top_tags: string[];
  created_at: string;
}

interface SearchRow {
  log_id: string;
  book_id: string;
  book_title: string;
  shelf_name: string | null;
  log_date: string;
  content: string;
  tags: string[];
}

export function createSupabaseBookshelf(
  supabase: SupabaseClient,
  userId: string,
  // The web store passes its once-per-request profile reader here.
  currentProjectId: () => Promise<string | null> = async () => {
    const profile = await supabase.from("profiles").select("current_project_id").eq("user_id", userId).maybeSingle();
    if (profile.error) throw new DrawerWebError("currentProject", profile.error.code);
    return profile.data?.current_project_id ?? null;
  },
): BookshelfStore {

  async function listShelves(): Promise<Shelf[]> {
    return check(
      "listShelves",
      await supabase.from("shelves").select("id, name, position").eq("user_id", userId).order("position").order("created_at"),
    );
  }

  const store: BookshelfStore = {
    listShelves,

    async getBookshelf() {
      const [rows, shelves, current, tags] = await Promise.all([
        supabase.rpc("drawer_bookshelf"),
        listShelves(),
        currentProjectId(),
        store.listTags(),
      ]);
      const books: BookSummary[] = (check("bookshelf", rows) as BookshelfRow[]).map((row) => ({
        id: row.book_id,
        title: row.title,
        shelfId: row.shelf_id,
        firstLog: row.first_log,
        lastLog: row.last_log,
        logCount: Number(row.log_count),
        topTags: row.top_tags,
        isCurrent: row.book_id === current,
        createdAt: row.created_at,
      }));
      return { shelves, books: sortBooks(books), tags };
    },

    async search(filters) {
      const { fromDate, toDate } = monthBounds(filters.from, filters.to);
      const rows = check(
        "search",
        await supabase.rpc("drawer_search_logs", {
          p_query: filters.q,
          p_tag: filters.tag,
          p_from: fromDate,
          p_to: toDate,
        }),
      ) as SearchRow[];
      return rows.map((row) => ({
        logId: row.log_id,
        bookId: row.book_id,
        bookTitle: row.book_title,
        shelfName: row.shelf_name,
        logDate: row.log_date,
        content: row.content,
        tags: row.tags,
      }));
    },

    async getBook(bookId) {
      // The book, its logs and the current book in one round: RLS returns no logs for a
      // book that is not the user's, and the result is dropped if the book is missing.
      const [project, logRows, current] = await Promise.all([
        supabase
          .from("projects")
          .select("id, title, shelf_id, created_at")
          .eq("user_id", userId)
          .eq("id", bookId)
          .maybeSingle(),
        supabase
          .from("daily_logs")
          .select("id, log_date, content, tags, edited")
          .eq("user_id", userId)
          .eq("project_id", bookId)
          .order("log_date", { ascending: false })
          .order("created_at", { ascending: false }),
        currentProjectId(),
      ]);
      // An invalid uuid is a 22P02 error: treat it as "not found".
      if (project.error?.code === "22P02") return null;
      if (project.error) throw new DrawerWebError("getBook", project.error.code);
      if (!project.data) return null;
      const logs: BookLog[] = check("getBook.logs", logRows).map((row) => ({
        id: row.id,
        logDate: row.log_date,
        content: row.content,
        tags: row.tags,
        edited: row.edited,
      }));
      return {
        book: {
          id: project.data.id,
          title: project.data.title,
          shelfId: project.data.shelf_id,
          firstLog: logs.at(-1)?.logDate ?? null,
          lastLog: logs[0]?.logDate ?? null,
          logCount: logs.length,
          topTags: topTags(logs),
          isCurrent: project.data.id === current,
          createdAt: project.data.created_at,
        },
        logs,
      };
    },

    async createShelf(name) {
      const shelves = await listShelves();
      const position = shelves.reduce((max, shelf) => Math.max(max, shelf.position), -1) + 1;
      checkWrite("createShelf", await supabase.from("shelves").insert({ user_id: userId, name, position }));
    },

    async renameShelf(shelfId, name) {
      checkWrite("renameShelf", await supabase.from("shelves").update({ name }).eq("user_id", userId).eq("id", shelfId));
    },

    async moveShelf(shelfId, direction) {
      const shelves = await listShelves();
      const index = shelves.findIndex((shelf) => shelf.id === shelfId);
      const other = shelves[direction === "up" ? index - 1 : index + 1];
      if (index < 0 || !other) return;
      // Re-number from the list order so equal positions can still be swapped.
      const order = shelves.map((shelf) => shelf.id);
      [order[index], order[shelves.indexOf(other)]] = [order[shelves.indexOf(other)], order[index]];
      for (const [position, id] of order.entries()) {
        checkWrite("moveShelf", await supabase.from("shelves").update({ position }).eq("user_id", userId).eq("id", id));
      }
    },

    async deleteShelf(shelfId) {
      // The FK sets the shelf's books back to shelf_id = null ("newly shelved").
      checkWrite("deleteShelf", await supabase.from("shelves").delete().eq("user_id", userId).eq("id", shelfId));
    },

    async moveBook(bookId, shelfId) {
      checkWrite(
        "moveBook",
        await supabase.from("projects").update({ shelf_id: shelfId }).eq("user_id", userId).eq("id", bookId),
      );
    },

    async updateLogTags(logId, tags) {
      checkWrite(
        "updateLogTags",
        await supabase.from("daily_logs").update({ tags: normalizeTags(tags) }).eq("user_id", userId).eq("id", logId),
      );
    },


    async listTags() {
      const rows = check(
        "listTags",
        await supabase
          .from("daily_logs")
          .select("tags")
          .eq("user_id", userId)
          .neq("tags", "{}")
          .order("created_at", { ascending: false })
          .limit(RECENT_LOGS_FOR_TAGS),
      ) as { tags: string[] }[];
      return [...new Set(rows.flatMap((row) => row.tags))];
    },
  };
  return store;
}
