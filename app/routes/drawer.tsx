import { ArrowDown, ArrowUp, BookPlus, ChevronsDownUp, ChevronsUpDown, Ellipsis, FolderPlus, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { data, Form, Link, useFetcher, useNavigation, useSearchParams } from "react-router";
import { z } from "zod";

import {
  type BookSummary,
  hasFilters,
  MAX_SHELF_NAME,
  NEW_SHELF_LABEL,
  parseSearchFilters,
  type SearchFilters,
  type SearchHit,
  type Shelf,
} from "~/features/drawer/bookshelf";
import { BookCover } from "~/features/drawer/components/BookCover";
import { ConfirmDelete } from "~/features/drawer/components/ConfirmDelete";
import { DrawerNav, Flash } from "~/features/drawer/components/DrawerNav";
import { Highlight, TagChips } from "~/features/drawer/components/TagChips";
import { DrawerWebError } from "~/features/drawer/drawer-web.server";
import { MAX_PROJECT_TITLE } from "~/features/drawer/limits";
import { TelegramSetup } from "~/features/drawer/components/TelegramSetup";
import { ICON, ui } from "~/features/drawer/components/ui";
import { useDismissible } from "~/features/drawer/components/useDismissible";
import { requireConsentedSession } from "~/features/drawer/session.server";
import { getEnv } from "~/lib/env.server";
import type { Route } from "./+types/drawer";

const uuid = z.uuid();
const shelfName = z.string().trim().min(1).max(MAX_SHELF_NAME);

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("create_shelf"), name: shelfName }),
  z.object({ intent: z.literal("rename_shelf"), shelfId: uuid, name: shelfName }),
  z.object({ intent: z.literal("move_shelf"), shelfId: uuid, direction: z.enum(["up", "down"]) }),
  z.object({ intent: z.literal("delete_shelf"), shelfId: uuid }),
  z.object({
    intent: z.literal("create_book"),
    title: z.string().trim().min(1).max(MAX_PROJECT_TITLE),
    shelfId: z.union([z.literal(""), uuid]).optional(),
  }),
]);

type ActionResult = { error?: string; done?: string };

export function meta({}: Route.MetaArgs) {
  return [{ title: "책장 · 이력서랍" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { store, headers, isDemo } = await requireConsentedSession(request);
  const filters = parseSearchFilters(new URL(request.url).searchParams);
  const [shelf, hits, overview, telegramTerm] = await Promise.all([
    store.getBookshelf(),
    hasFilters(filters) ? store.search(filters) : Promise.resolve(null),
    // ponytail: overview also loads projects and recent logs; add a narrow status query if this page gets slow.
    store.getOverview(),
    store.getTelegramTerm(),
  ]);
  const setup = {
    isLinked: overview.telegram !== null,
    notifyHour: overview.notifyHour,
    botUsername: getEnv().TELEGRAM_BOT_USERNAME,
    term: telegramTerm,
  };
  return data({ ...shelf, filters, hits, isDemo, setup }, { headers });
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
        await store.createProject(input.title, input.shelfId || null);
        return data<ActionResult>({ done: `'${input.title}' 책을 만들었어요.` }, { headers });
    }
  } catch (error) {
    if (!(error instanceof DrawerWebError)) throw error;
    console.error("bookshelf action failed", input.intent, error.code ?? "");
    return data<ActionResult>({ error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500, headers });
  }
}

function SearchBar({ filters, tags }: { filters: SearchFilters; tags: string[] }) {
  const [, setSearchParams] = useSearchParams();
  const activeFilters = [filters.tag, filters.from, filters.to].filter(Boolean).length;
  const filtersRef = useDismissible();
  return (
    <Form method="get" role="search" className="flex items-start gap-2">
      <label className="relative min-w-0 flex-1">
        <Search {...ICON} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="공고 요건으로 찾기"
          aria-label="기록 검색"
          className={`${ui.input} w-full py-2.5 pl-9`}
        />
      </label>
      <details ref={filtersRef} className="group relative" open={activeFilters > 0 ? true : undefined}>
        <summary className={`${ui.secondary} list-none py-2.5 [&::-webkit-details-marker]:hidden`}>
          <SlidersHorizontal {...ICON} aria-hidden />
          <span className="max-sm:sr-only">필터</span>
          {activeFilters > 0 && (
            <span className="rounded-full bg-brass px-1.5 text-xs font-semibold text-brass-ink tabular-nums">{activeFilters}</span>
          )}
        </summary>
        <div className="absolute top-full right-0 z-20 mt-2 grid w-[min(30rem,calc(100vw-2rem))] gap-3 rounded-lg border border-line bg-raised p-4 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.55)] sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={ui.label}>태그</span>
            <select name="tag" defaultValue={filters.tag ?? ""} aria-label="태그 필터" className={ui.input}>
              <option value="">전체</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={ui.label}>시작 월</span>
            <input type="month" name="from" defaultValue={filters.from ?? ""} aria-label="시작 월" className={ui.input} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={ui.label}>끝 월</span>
            <input type="month" name="to" defaultValue={filters.to ?? ""} aria-label="끝 월" className={ui.input} />
          </label>
        </div>
      </details>
      <button type="submit" className={`${ui.primary} py-2.5`}>
        찾기
      </button>
      {hasFilters(filters) && (
        <button type="button" onClick={() => setSearchParams({})} className={`${ui.ghost} py-2.5`}>
          <X {...ICON} aria-hidden />
          <span className="max-sm:sr-only">지우기</span>
        </button>
      )}
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
    <section aria-label="검색 결과" className="flex flex-col gap-6">
      <p className="flex items-center gap-2 text-sm text-muted" data-testid="search-summary">
        <Search {...ICON} aria-hidden />
        <span>
          {describeFilters(filters)} · <span className="tabular-nums">기록 {hits.length}건 · 책 {groups.size}권</span>
        </span>
      </p>
      {hits.length === 0 && (
        <p className={`${ui.panel} p-6 text-sm text-muted`}>맞는 기록이 없어요. 다른 낱말이나 태그로 찾아보세요.</p>
      )}
      {[...groups.values()].map((bookHits) => (
        <article key={bookHits[0].bookId} className="flex flex-col gap-2">
          <h2 className="flex flex-wrap items-baseline gap-x-2 border-b border-line pb-2">
            <Link to={`/drawer/books/${bookHits[0].bookId}`} viewTransition className="text-lg font-semibold tracking-title hover:text-brass">
              {bookHits[0].bookTitle}
            </Link>
            <span className="text-xs text-faint">{bookHits[0].shelfName ?? NEW_SHELF_LABEL}</span>
          </h2>
          <ul className="flex flex-col divide-y divide-line">
            {bookHits.map((hit) => (
              <li key={hit.logId} data-testid="search-hit" className="grid gap-1 py-3 sm:grid-cols-[6.5rem_1fr] sm:gap-4">
                <span className="text-xs text-faint tabular-nums sm:pt-0.5">{hit.logDate}</span>
                <div className="flex min-w-0 flex-col gap-2">
                  <Link to={`/drawer/books/${hit.bookId}#log-${hit.logId}`} className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] hover:text-brass">
                    <Highlight text={hit.content} query={filters.q} />
                  </Link>
                  <TagChips tags={hit.tags} />
                </div>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}

function MenuItem({ children, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      {...props}
      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-ink transition hover:bg-sunken disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** Everything you can do to a shelf, behind one ⋯ button so the header reads as a single line. */
function ShelfMenu({
  shelf,
  name,
  index,
  total,
  busy,
  isOpen,
  onToggle,
}: {
  shelf: Shelf | null;
  name: string;
  index: number;
  total: number;
  busy: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const menuRef = useDismissible();
  return (
    <details ref={menuRef} className="relative">
      <summary aria-label={`${name} 칸 메뉴`} className={`${ui.icon} list-none [&::-webkit-details-marker]:hidden`}>
        <Ellipsis {...ICON} aria-hidden />
      </summary>
      <div className="absolute top-full right-0 z-20 mt-1 flex w-60 flex-col gap-0.5 rounded-lg border border-line bg-raised p-1.5 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.55)]">
        <MenuItem type="button" onClick={onToggle}>
          {isOpen ? <ChevronsDownUp {...ICON} aria-hidden /> : <ChevronsUpDown {...ICON} aria-hidden />}
          {isOpen ? "칸 접기" : "칸 펼치기"}
        </MenuItem>
        {shelf && (
          <>
            <Form method="post">
              <input type="hidden" name="shelfId" value={shelf.id} />
              <input type="hidden" name="direction" value="up" />
              <MenuItem name="intent" value="move_shelf" disabled={busy || index === 0} aria-label={`${name} 칸 위로`}>
                <ArrowUp {...ICON} aria-hidden />
                위로 옮기기
              </MenuItem>
            </Form>
            <Form method="post">
              <input type="hidden" name="shelfId" value={shelf.id} />
              <input type="hidden" name="direction" value="down" />
              <MenuItem name="intent" value="move_shelf" disabled={busy || index === total - 1} aria-label={`${name} 칸 아래로`}>
                <ArrowDown {...ICON} aria-hidden />
                아래로 옮기기
              </MenuItem>
            </Form>
            <Form method="post" className="mt-1 flex gap-1.5 border-t border-line px-1 pt-2">
              <input type="hidden" name="intent" value="rename_shelf" />
              <input type="hidden" name="shelfId" value={shelf.id} />
              <input name="name" defaultValue={shelf.name} maxLength={MAX_SHELF_NAME} required aria-label="칸 이름" className={`${ui.input} flex-1 py-1.5`} />
              <button type="submit" disabled={busy} className={`${ui.secondary} px-2.5 py-1.5`}>
                바꾸기
              </button>
            </Form>
            <div className="px-0.5">
              <ConfirmDelete
                label="칸 지우기"
                question={`'${shelf.name}' 칸을 지울까요? 꽂힌 책은 '${NEW_SHELF_LABEL}'로 옮겨져요.`}
                intent="delete_shelf"
                fields={{ shelfId: shelf.id }}
                busy={busy}
              />
            </div>
          </>
        )}
      </div>
    </details>
  );
}

const SLOT = "flex aspect-[5/7] w-full flex-col rounded-sm border border-dashed";

/** The empty slot at the end of every shelf: name a book here and it is filed on this shelf. */
function AddBookSlot({ shelf, name }: { shelf: Shelf | null; name: string }) {
  const fetcher = useFetcher<typeof action>();
  const [isAdding, setIsAdding] = useState(false);
  const isSaving = fetcher.state !== "idle";
  // Close the slot once the book is on the shelf; keep it open to show an error.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.done) setIsAdding(false);
  }, [fetcher.state, fetcher.data]);

  if (!isAdding) {
    return (
      <button
        type="button"
        onClick={() => setIsAdding(true)}
        aria-label={`${name} 칸에 책 추가`}
        className={`${SLOT} items-center justify-center gap-2 border-line text-sm text-muted transition hover:border-brass hover:text-brass`}
      >
        <BookPlus size={22} strokeWidth={1.5} aria-hidden />
        책 추가
      </button>
    );
  }
  return (
    <fetcher.Form method="post" className={`${SLOT} justify-center gap-2 border-brass p-3`}>
      <input type="hidden" name="intent" value="create_book" />
      <input type="hidden" name="shelfId" value={shelf?.id ?? ""} />
      <input
        name="title"
        placeholder="책(프로젝트) 이름"
        aria-label={`${name} 칸에 꽂을 책 이름`}
        maxLength={MAX_PROJECT_TITLE}
        required
        autoFocus
        onKeyDown={(event) => event.key === "Escape" && setIsAdding(false)}
        className={`${ui.input} w-full`}
      />
      {fetcher.data?.error && (
        <p role="alert" className="text-xs text-danger">
          {fetcher.data.error}
        </p>
      )}
      <button type="submit" disabled={isSaving} className={`${ui.primary} w-full`}>
        {isSaving ? "꽂는 중…" : "꽂기"}
      </button>
      <button type="button" onClick={() => setIsAdding(false)} className={`${ui.ghost} w-full`}>
        취소
      </button>
    </fetcher.Form>
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
  const [isOpen, setIsOpen] = useState(true);
  const headingId = `shelf-${shelf?.id ?? "new"}`;
  return (
    <section data-testid="shelf" aria-labelledby={headingId} className="flex flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="flex min-w-0 items-baseline gap-2 text-left"
        >
          <h2 id={headingId} className="truncate text-lg font-semibold tracking-title text-ink">
            {name}
          </h2>
          <span className="shrink-0 text-sm text-muted tabular-nums">{books.length}권</span>
        </button>
        <ShelfMenu shelf={shelf} name={name} index={index} total={total} busy={busy} isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} />
      </header>

      {isOpen && (
          <div>
            {books.length === 0 && (
              <p className="px-1 pt-4 text-sm text-muted">비어 있는 칸이에요. 여기서 책을 추가하거나, 책을 열고 '책 관리 → 칸으로 이동'에서 이 칸을 고르세요.</p>
            )}
            {/* Room above and beside each book so the turn and lift stay inside the shelf. */}
            <div className="grid grid-cols-2 gap-x-5 gap-y-8 px-3 pt-5 min-[440px]:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
              {books.map((book) => (
                <BookCover key={book.id} book={book} />
              ))}
              <AddBookSlot shelf={shelf} name={name} />
            </div>
            {/* The plank: a lit top face the books stand on, then the darker front edge, drawn over the book feet. */}
            <div aria-hidden className="relative z-10 -mt-1.5">
              <div className="h-2 bg-[linear-gradient(180deg,var(--wood-top),var(--wood))] [clip-path:polygon(0.6%_0,99.4%_0,100%_100%,0_100%)]" />
              <div className="h-3 rounded-b-xs bg-[linear-gradient(180deg,var(--wood-dark),color-mix(in_oklab,var(--wood-dark),black_25%))] shadow-[0_12px_20px_-10px_rgba(0,0,0,0.6)]" />
            </div>
          </div>
      )}
    </section>
  );
}

function CreateShelfForm({ busy }: { busy: boolean }) {
  return (
    <Form method="post" className="flex gap-2">
      <input type="hidden" name="intent" value="create_shelf" />
      <input name="name" placeholder="새 칸 이름 (예: A사, 개인 프로젝트)" aria-label="새 칸 이름" maxLength={MAX_SHELF_NAME} required className={`${ui.input} flex-1`} />
      <button type="submit" disabled={busy} className={`${ui.secondary} ${CREATE_BUTTON_WIDTH}`}>
        <FolderPlus {...ICON} aria-hidden />칸 만들기
      </button>
    </Form>
  );
}

const CREATE_BUTTON_WIDTH = "w-32";

function CreateBookForm({ busy }: { busy: boolean }) {
  return (
    <Form method="post" className="flex gap-2">
      <input type="hidden" name="intent" value="create_book" />
      <input
        name="title"
        placeholder="새 책(프로젝트) 이름"
        aria-label="새 책 이름"
        maxLength={MAX_PROJECT_TITLE}
        required
        className={`${ui.input} flex-1`}
      />
      <button type="submit" disabled={busy} className={`${ui.primary} ${CREATE_BUTTON_WIDTH}`}>
        <BookPlus {...ICON} aria-hidden />책 만들기
      </button>
    </Form>
  );
}

export default function Bookshelf({ loaderData, actionData }: Route.ComponentProps) {
  const { shelves, books, tags, filters, hits, isDemo, setup } = loaderData;
  const busy = useNavigation().state !== "idle";
  const unshelved = books.filter((book) => book.shelfId === null);

  return (
    <main className="min-h-screen bg-ground text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
        <DrawerNav isDemo={isDemo} />
        <SearchBar key={JSON.stringify(filters)} filters={filters} tags={tags} />
        <Flash error={actionData?.error} done={actionData?.done} />
        <TelegramSetup {...setup} isDemo={isDemo} />

        {hits ? (
          <SearchResults hits={hits} filters={filters} />
        ) : (
          <>
            <div className="flex flex-col gap-10">
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

            {books.length === 0 ? (
              <section aria-label="첫 책 만들기" className={`${ui.panel} flex flex-col gap-3 p-6`}>
                <h2 className="text-xl font-semibold tracking-title">첫 책을 꽂아 볼까요?</h2>
                <p className="max-w-prose text-sm leading-relaxed text-muted">
                  지금 하고 있는 프로젝트 이름으로 책을 만들면, 텔레그램으로 답한 기록이 이 책에 쌓여요.
                </p>
                <CreateBookForm busy={busy} />
              </section>
            ) : (
              <section aria-label="책장 정리" className={`grid gap-3 border-t border-line pt-6 ${shelves.length > 0 ? "md:grid-cols-2" : ""}`}>
                {shelves.length > 0 ? (
                  <CreateShelfForm busy={busy} />
                ) : (
                  // Shelves only make sense once there are books to group, so they are offered here first.
                  <details className="text-sm">
                    <summary className={`${ui.disclosure} inline-flex items-center gap-1.5`}>
                      <FolderPlus {...ICON} aria-hidden />
                      책을 회사나 주제별로 칸에 묶어 볼까요?
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      <p className="text-xs text-muted">칸을 만든 뒤 책을 열고 '칸으로 이동'에서 고르면 그 칸에 꽂혀요.</p>
                      <CreateShelfForm busy={busy} />
                    </div>
                  </details>
                )}
                <CreateBookForm busy={busy} />
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
