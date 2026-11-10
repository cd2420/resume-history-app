import { data, Form, Link, useNavigation } from "react-router";
import { z } from "zod";

import { formatPeriod, groupByMonth, MAX_SHELF_NAME, NEW_SHELF_LABEL } from "~/features/drawer/bookshelf";
import { spineColor } from "~/features/drawer/components/BookCover";
import { DrawerNav, Flash } from "~/features/drawer/components/DrawerNav";
import { TagChips } from "~/features/drawer/components/TagChips";
import { DrawerWebError } from "~/features/drawer/drawer-web.server";
import { MAX_LOG_LENGTH, MAX_PROJECT_TITLE } from "~/features/drawer/limits";
import { requireConsentedSession } from "~/features/drawer/session.server";
import { formatTagInput, MAX_TAGS, normalizeTags, parseTagInput } from "~/features/drawer/tags";
import type { Route } from "./+types/drawer.books.$bookId";

const uuid = z.uuid();

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("rename_book"), title: z.string().trim().min(1).max(MAX_PROJECT_TITLE) }),
  z.object({ intent: z.literal("move_book"), shelfId: z.union([z.literal(""), uuid]) }),
  z.object({ intent: z.literal("set_current") }),
  z.object({ intent: z.literal("update_log"), logId: uuid, content: z.string().trim().min(1).max(MAX_LOG_LENGTH) }),
  z.object({ intent: z.literal("update_tags"), logId: uuid, tags: z.string().max(400) }),
  z.object({ intent: z.literal("delete_log"), logId: uuid }),
]);

type ActionResult = { error?: string; done?: string };

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.book.title} · 이력서랍` : "이력서랍" }];
}

async function loadBook(request: Request, bookId: string) {
  const session = await requireConsentedSession(request);
  const detail = uuid.safeParse(bookId).success ? await session.store.getBook(bookId) : null;
  if (!detail) throw data("책을 찾을 수 없어요.", { status: 404 });
  return { session, detail };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { session, detail } = await loadBook(request, params.bookId);
  const { shelves } = await session.store.getBookshelf();
  return data({ ...detail, shelves, isDemo: session.isDemo }, { headers: session.headers });
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, detail } = await loadBook(request, params.bookId);
  const { store, headers } = session;
  const parsed = actionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data<ActionResult>({ error: "입력값을 확인해 주세요." }, { status: 400, headers });
  const input = parsed.data;
  const bookId = detail.book.id;

  try {
    switch (input.intent) {
      case "rename_book":
        await store.renameProject(bookId, input.title);
        return data<ActionResult>({ done: "책 이름을 바꿨어요." }, { headers });
      case "move_book":
        await store.moveBook(bookId, input.shelfId || null);
        return data<ActionResult>({ done: "칸을 옮겼어요." }, { headers });
      case "set_current":
        await store.setCurrentProject(bookId);
        return data<ActionResult>({ done: "이제 텔레그램 기록이 이 책에 들어가요." }, { headers });
      case "update_log":
        await store.updateLog(input.logId, input.content);
        return data<ActionResult>({ done: "기록을 고쳤어요." }, { headers });
      case "update_tags":
        await store.updateLogTags(input.logId, normalizeTags(parseTagInput(input.tags)));
        return data<ActionResult>({ done: "태그를 고쳤어요." }, { headers });
      case "delete_log":
        await store.deleteLog(input.logId);
        return data<ActionResult>({ done: "기록을 지웠어요." }, { headers });
    }
  } catch (error) {
    if (!(error instanceof DrawerWebError)) throw error;
    console.error("book action failed", input.intent, error.code ?? "");
    return data<ActionResult>({ error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500, headers });
  }
}

const input = "min-w-0 rounded bg-slate-900 px-3 py-2 text-sm";
const button = "shrink-0 whitespace-nowrap rounded bg-sky-600 px-3 py-2 text-sm font-semibold disabled:opacity-50";
const subtle = "shrink-0 whitespace-nowrap rounded bg-slate-700 px-3 py-2 text-sm disabled:opacity-50";

function monthLabel(month: string) {
  return `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;
}

export default function Book({ loaderData, actionData }: Route.ComponentProps) {
  const { book, logs, shelves, isDemo } = loaderData;
  const busy = useNavigation().state !== "idle";
  const months = groupByMonth(logs);
  const shelfName = shelves.find((shelf) => shelf.id === book.shelfId)?.name ?? NEW_SHELF_LABEL;

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-6 text-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <DrawerNav isDemo={isDemo} />
        <Link to="/drawer" className="w-fit text-sm text-sky-400 hover:underline">
          ← 책장
        </Link>

        <header className="flex gap-4 rounded bg-slate-800 p-4">
          <span aria-hidden className={`w-2 shrink-0 rounded ${spineColor(book.id)}`} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="text-2xl font-bold break-keep">{book.title}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              {book.isCurrent && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-xs font-semibold text-white">● 진행 중</span>}
              <span>{formatPeriod(book)}</span>
              <span>· 기록 {book.logCount}개</span>
              <span>· 📇 {shelfName}</span>
            </p>
            <TagChips tags={book.topTags} />
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-slate-400">책 관리</summary>
              <div className="mt-2 flex flex-col gap-2 md:flex-row md:flex-wrap">
                <Form method="post" className="flex min-w-0 gap-2">
                  <input type="hidden" name="intent" value="rename_book" />
                  <input name="title" defaultValue={book.title} maxLength={MAX_PROJECT_TITLE} required aria-label="책 이름" className={`${input} flex-1`} />
                  <button type="submit" disabled={busy} className={subtle}>
                    이름 바꾸기
                  </button>
                </Form>
                <Form method="post" className="flex min-w-0 gap-2">
                  <input type="hidden" name="intent" value="move_book" />
                  <select name="shelfId" defaultValue={book.shelfId ?? ""} aria-label="칸으로 이동" className={`${input} flex-1`}>
                    <option value="">{NEW_SHELF_LABEL}</option>
                    {shelves.map((shelf) => (
                      <option key={shelf.id} value={shelf.id}>
                        {shelf.name.slice(0, MAX_SHELF_NAME)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" disabled={busy} className={subtle}>
                    칸으로 이동
                  </button>
                </Form>
                {!book.isCurrent && (
                  <Form method="post">
                    <button name="intent" value="set_current" disabled={busy} className={subtle}>
                      현재 프로젝트로
                    </button>
                  </Form>
                )}
              </div>
            </details>
          </div>
        </header>

        <Flash error={actionData?.error} done={actionData?.done} />

        {logs.length === 0 ? (
          <p className="rounded bg-slate-800 p-4 text-sm text-slate-300">아직 기록이 없어요. 현재 프로젝트로 정하고 텔레그램으로 보내 보세요.</p>
        ) : (
          <div className="flex flex-col gap-4 md:grid md:grid-cols-[9rem_1fr] md:items-start">
            <nav aria-label="목차" className="md:sticky md:top-4">
              <h2 className="mb-1 hidden text-xs text-slate-400 md:block">목차</h2>
              <ol className="flex gap-1 overflow-x-auto md:flex-col">
                {months.map(({ month, logs: monthLogs }) => (
                  <li key={month} className="shrink-0">
                    <a href={`#m-${month}`} className="block rounded px-2 py-1 text-sm whitespace-nowrap text-slate-300 hover:bg-slate-800">
                      {month.replace("-", ".")} <span className="text-xs text-slate-500">{monthLogs.length}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="flex min-w-0 flex-col gap-6">
              {months.map(({ month, logs: monthLogs }) => (
                <section key={month} id={`m-${month}`} className="scroll-mt-4" aria-label={monthLabel(month)}>
                  <h2 className="mb-2 border-b border-slate-700 pb-1 font-semibold">{monthLabel(month)}</h2>
                  <ol className="flex flex-col gap-2">
                    {monthLogs.map((log) => (
                      <li
                        key={log.id}
                        id={`log-${log.id}`}
                        data-testid="log"
                        className="flex scroll-mt-4 flex-col gap-2 rounded bg-slate-800 p-3 target:ring-2 target:ring-amber-400"
                      >
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <time dateTime={log.logDate}>{log.logDate.slice(5).replace("-", ".")}</time>
                          {log.edited && <span className="rounded bg-slate-700 px-1">직접 수정</span>}
                        </div>
                        <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{log.content}</p>
                        <TagChips tags={log.tags} />
                        {/* Keyed by content and tags so the editor collapses after a successful save. */}
                        <details key={`${log.content}|${log.tags.join(",")}`}>
                          <summary className="cursor-pointer text-xs text-slate-400">수정·삭제</summary>
                          <div className="mt-2 flex flex-col gap-3">
                            <Form method="post" className="flex flex-col gap-2">
                              <input type="hidden" name="intent" value="update_log" />
                              <input type="hidden" name="logId" value={log.id} />
                              <textarea name="content" defaultValue={log.content} maxLength={MAX_LOG_LENGTH} required rows={3} aria-label="기록 내용" className={input} />
                              <p className="text-xs text-amber-400">고친 글은 그대로 저장돼요. 고객사명·내부 시스템명·절대 수치는 빼고 써 주세요.</p>
                              <button type="submit" disabled={busy} className={button}>
                                고친 내용 저장
                              </button>
                            </Form>
                            <Form method="post" className="flex gap-2">
                              <input type="hidden" name="intent" value="update_tags" />
                              <input type="hidden" name="logId" value={log.id} />
                              <input
                                name="tags"
                                defaultValue={formatTagInput(log.tags)}
                                placeholder="쉼표로 구분 (예: Kafka, 대용량 트래픽)"
                                aria-label="태그 편집"
                                className={`${input} flex-1`}
                              />
                              <button type="submit" disabled={busy} className={subtle}>
                                태그 저장
                              </button>
                            </Form>
                            <p className="text-xs text-slate-500">태그는 최대 {MAX_TAGS}개, 각 30자까지예요.</p>
                            <Form
                              method="post"
                              onSubmit={(event) => {
                                if (!confirm("이 기록을 지울까요?")) event.preventDefault();
                              }}
                            >
                              <input type="hidden" name="logId" value={log.id} />
                              <button name="intent" value="delete_log" disabled={busy} className="text-sm text-red-400 underline">
                                삭제
                              </button>
                            </Form>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
