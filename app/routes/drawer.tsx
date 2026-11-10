import { data, Form, Link, useNavigation, useSearchParams } from "react-router";
import { z } from "zod";

import {
  type BookSummary,
  FILL_TAGS_BATCH,
  hasFilters,
  MAX_SHELF_NAME,
  NEW_SHELF_LABEL,
  parseSearchFilters,
  type SearchFilters,
  type SearchHit,
  type Shelf,
} from "~/features/drawer/bookshelf";
import { fillMissingTags } from "~/features/drawer/bookshelf.server";
import { BookCover } from "~/features/drawer/components/BookCover";
import { ConfirmDelete } from "~/features/drawer/components/ConfirmDelete";
import { DrawerNav, Flash } from "~/features/drawer/components/DrawerNav";
import { Highlight, TagChips } from "~/features/drawer/components/TagChips";
import { DrawerWebError } from "~/features/drawer/drawer-web.server";
import { MAX_PROJECT_TITLE } from "~/features/drawer/limits";
import { requireConsentedSession } from "~/features/drawer/session.server";
import { getLlm } from "~/lib/llm.server";
import type { Route } from "./+types/drawer";

const uuid = z.uuid();
const shelfName = z.string().trim().min(1).max(MAX_SHELF_NAME);

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("create_shelf"), name: shelfName }),
  z.object({ intent: z.literal("rename_shelf"), shelfId: uuid, name: shelfName }),
  z.object({ intent: z.literal("move_shelf"), shelfId: uuid, direction: z.enum(["up", "down"]) }),
  z.object({ intent: z.literal("delete_shelf"), shelfId: uuid }),
  z.object({ intent: z.literal("create_book"), title: z.string().trim().min(1).max(MAX_PROJECT_TITLE) }),
  z.object({ intent: z.literal("fill_tags") }),
]);

type ActionResult = { error?: string; done?: string };

export function meta({}: Route.MetaArgs) {
  return [{ title: "책장 · 이력서랍" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { store, headers, isDemo } = await requireConsentedSession(request);
  const filters = parseSearchFilters(new URL(request.url).searchParams);
  const [shelf, hits] = await Promise.all([
    store.getBookshelf(),
    hasFilters(filters) ? store.search(filters) : Promise.resolve(null),
  ]);
  return data({ ...shelf, filters, hits, isDemo }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const { store, headers } = await requireConsentedSession(request);
  const parsed = actionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data<ActionResult>({ error: "입력값을 확인해 주세요." }, { status: 400, headers });
  const input = parsed.data;

  try {
    switch (input.intent) {
      case "create_shelf":
        await store.createShelf(input.name);
        return data<ActionResult>({ done: `'${input.name}' 칸을 만들었어요.` }, { headers });
      case "rename_shelf":
        await store.renameShelf(input.shelfId, input.name);
        return data<ActionResult>({ done: "칸 이름을 바꿨어요." }, { headers });
      case "move_shelf":
        await store.moveShelf(input.shelfId, input.direction);
        return data<ActionResult>({}, { headers });
      case "delete_shelf":
        await store.deleteShelf(input.shelfId);
        return data<ActionResult>({ done: `칸을 지웠어요. 꽂혀 있던 책은 '${NEW_SHELF_LABEL}'로 옮겼어요.` }, { headers });
      case "create_book":
        await store.createProject(input.title);
        return data<ActionResult>({ done: `'${input.title}' 책을 만들었어요.` }, { headers });
      case "fill_tags": {
        const { tagged, failed } = await fillMissingTags(store, getLlm());
        const message = failed ? `기록 ${tagged}개에 태그를 붙였어요. ${failed}개는 실패했어요.` : `기록 ${tagged}개에 태그를 붙였어요.`;
        return data<ActionResult>({ done: message }, { headers });
      }
    }
  } catch (error) {
    if (!(error instanceof DrawerWebError)) throw error;
    console.error("bookshelf action failed", input.intent, error.code ?? "");
    return data<ActionResult>({ error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500, headers });
  }
}

const input = "min-w-0 rounded bg-slate-900 px-3 py-2 text-sm";
const button = "shrink-0 whitespace-nowrap rounded bg-sky-600 px-3 py-2 text-sm font-semibold disabled:opacity-50";
const iconButton = "rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-30";

function SearchBar({ filters, tags }: { filters: SearchFilters; tags: string[] }) {
  const [, setSearchParams] = useSearchParams();
  return (
    <Form method="get" role="search" className="flex flex-col gap-2 rounded bg-slate-800 p-3 md:flex-row md:items-end">
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-xs text-slate-400">키워드</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="예: 캐시, 결제, 장애"
          aria-label="기록 검색"
          className={input}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">태그</span>
          <select name="tag" defaultValue={filters.tag ?? ""} aria-label="태그 필터" className={input}>
            <option value="">전체</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">시작 월</span>
          <input type="month" name="from" defaultValue={filters.from ?? ""} aria-label="시작 월" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">끝 월</span>
          <input type="month" name="to" defaultValue={filters.to ?? ""} aria-label="끝 월" className={input} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={button}>
            찾기
          </button>
          {hasFilters(filters) && (
            <button type="button" onClick={() => setSearchParams({})} className="px-2 py-2 text-sm text-slate-400 underline">
              지우기
            </button>
          )}
        </div>
      </div>
    </Form>
  );
}

function describeFilters(filters: SearchFilters): string {
  return [
    filters.q && `"${filters.q}"`,
    filters.tag && `#${filters.tag}`,
    (filters.from || filters.to) && `${filters.from ?? "처음"} ~ ${filters.to ?? "지금"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function SearchResults({ hits, filters }: { hits: SearchHit[]; filters: SearchFilters }) {
  const groups = new Map<string, SearchHit[]>();
  for (const hit of hits) groups.set(hit.bookId, [...(groups.get(hit.bookId) ?? []), hit]);

  return (
    <section aria-label="검색 결과" className="flex flex-col gap-4">
      <p className="text-sm text-slate-300" data-testid="search-summary">
        🔍 {describeFilters(filters)} · 기록 {hits.length}건 · 책 {groups.size}권
      </p>
      {hits.length === 0 && <p className="rounded bg-slate-800 p-4 text-sm text-slate-400">맞는 기록이 없어요.</p>}
      {[...groups.values()].map((bookHits) => (
        <article key={bookHits[0].bookId} className="flex flex-col gap-2 rounded bg-slate-800 p-4">
          <h2 className="font-semibold">
            <Link to={`/drawer/books/${bookHits[0].bookId}`} className="hover:underline">
              📕 {bookHits[0].bookTitle}
            </Link>
            <span className="ml-2 text-xs font-normal text-slate-400">{bookHits[0].shelfName ?? NEW_SHELF_LABEL}</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {bookHits.map((hit) => (
              <li key={hit.logId} data-testid="search-hit" className="flex flex-col gap-1 rounded bg-slate-900 p-3">
                <Link to={`/drawer/books/${hit.bookId}#log-${hit.logId}`} className="flex flex-col gap-1 hover:opacity-90">
                  <span className="text-xs text-slate-400">{hit.logDate}</span>
                  <span className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                    <Highlight text={hit.content} query={filters.q} />
                  </span>
                </Link>
                <TagChips tags={hit.tags} />
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}

function ShelfRow({
  shelf,
  books,
  index,
  total,
  busy,
}: {
  shelf: Shelf | null;
  books: BookSummary[];
  index: number;
  total: number;
  busy: boolean;
}) {
  const name = shelf?.name ?? NEW_SHELF_LABEL;
  return (
    <details open className="group rounded bg-slate-800/60" data-testid="shelf">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 border-b-4 border-slate-700 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="text-slate-500 transition group-open:rotate-90">▸</span>
          <span className="truncate font-semibold">📇 {name}</span>
          <span className="shrink-0 text-xs text-slate-400">{books.length}권</span>
        </span>
        {shelf && (
          <span className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <Form method="post">
              <input type="hidden" name="shelfId" value={shelf.id} />
              <input type="hidden" name="direction" value="up" />
              <button name="intent" value="move_shelf" disabled={busy || index === 0} aria-label={`${name} 칸 위로`} className={iconButton}>
                ↑
              </button>
            </Form>
            <Form method="post">
              <input type="hidden" name="shelfId" value={shelf.id} />
              <input type="hidden" name="direction" value="down" />
              <button
                name="intent"
                value="move_shelf"
                disabled={busy || index === total - 1}
                aria-label={`${name} 칸 아래로`}
                className={iconButton}
              >
                ↓
              </button>
            </Form>
          </span>
        )}
      </summary>

      <div className="flex flex-col gap-3 p-3">
        {books.length === 0 ? (
          <p className="text-sm text-slate-400">비어 있어요. 책을 열고 '칸으로 이동'에서 이 칸을 고르세요.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] md:overflow-visible">
            {books.map((book) => (
              <BookCover key={book.id} book={book} />
            ))}
          </div>
        )}
        {shelf && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-slate-400">칸 관리</summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Form method="post" className="flex min-w-0 gap-2">
                <input type="hidden" name="intent" value="rename_shelf" />
                <input type="hidden" name="shelfId" value={shelf.id} />
                <input name="name" defaultValue={shelf.name} maxLength={MAX_SHELF_NAME} required aria-label="칸 이름" className={input} />
                <button type="submit" disabled={busy} className="rounded bg-slate-700 px-3 py-2 text-sm">
                  이름 바꾸기
                </button>
              </Form>
              <ConfirmDelete
                label="칸 지우기"
                question={`'${shelf.name}' 칸을 지울까요? 꽂힌 책은 '${NEW_SHELF_LABEL}'로 옮겨져요.`}
                intent="delete_shelf"
                fields={{ shelfId: shelf.id }}
                busy={busy}
              />
            </div>
          </details>
        )}
      </div>
    </details>
  );
}

export default function Bookshelf({ loaderData, actionData }: Route.ComponentProps) {
  const { shelves, books, untaggedCount, tags, filters, hits, isDemo } = loaderData;
  const busy = useNavigation().state !== "idle";
  const unshelved = books.filter((book) => book.shelfId === null);

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-6 text-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <DrawerNav isDemo={isDemo} />
        <SearchBar key={JSON.stringify(filters)} filters={filters} tags={tags} />
        <Flash error={actionData?.error} done={actionData?.done} />

        {hits ? (
          <SearchResults hits={hits} filters={filters} />
        ) : (
          <>
            {untaggedCount > 0 && (
              <Form method="post" className="flex flex-wrap items-center gap-2 rounded bg-slate-800 px-3 py-2 text-sm">
                <span className="text-slate-300">태그 없는 기록 {untaggedCount}개</span>
                <button name="intent" value="fill_tags" disabled={busy} className="rounded bg-slate-700 px-3 py-1.5 text-sm">
                  {busy ? "태그 붙이는 중…" : `태그 채우기 (최대 ${FILL_TAGS_BATCH}개)`}
                </button>
              </Form>
            )}

            {books.length === 0 && (
              <p className="rounded bg-slate-800 p-4 text-sm text-slate-300">
                아직 책이 없어요. 텔레그램에서 <code>/project 이름</code>으로 만들거나 아래에서 만들어 보세요.
              </p>
            )}

            <div className="flex flex-col gap-4">
              {unshelved.length > 0 && <ShelfRow shelf={null} books={unshelved} index={-1} total={0} busy={busy} />}
              {shelves.map((shelf, index) => (
                <ShelfRow
                  key={shelf.id}
                  shelf={shelf}
                  books={books.filter((book) => book.shelfId === shelf.id)}
                  index={index}
                  total={shelves.length}
                  busy={busy}
                />
              ))}
            </div>

            <div className="grid gap-3 rounded bg-slate-800 p-3 md:grid-cols-2">
              <Form method="post" className="flex gap-2">
                <input type="hidden" name="intent" value="create_shelf" />
                <input name="name" placeholder="새 칸 이름 (예: A사, 개인 프로젝트)" aria-label="새 칸 이름" maxLength={MAX_SHELF_NAME} required className={`${input} flex-1`} />
                <button type="submit" disabled={busy} className={button}>
                  칸 만들기
                </button>
              </Form>
              <Form method="post" className="flex gap-2">
                <input type="hidden" name="intent" value="create_book" />
                <input name="title" placeholder="새 책(프로젝트) 이름" aria-label="새 책 이름" maxLength={MAX_PROJECT_TITLE} required className={`${input} flex-1`} />
                <button type="submit" disabled={busy} className={button}>
                  책 만들기
                </button>
              </Form>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
