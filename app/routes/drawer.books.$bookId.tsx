import { ArrowLeft, BookCheck, CalendarRange, ChevronDown, Dot, FileText, LibraryBig, PenLine, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { data, Form, Link, useNavigation } from "react-router";
import { z } from "zod";

import { formatPeriod, groupByMonth, isLoggableDate, MAX_SHELF_NAME, NEW_SHELF_LABEL } from "~/features/drawer/bookshelf";
import { bookTransitionName, spineColor } from "~/features/drawer/components/BookCover";
import { ConfirmDelete } from "~/features/drawer/components/ConfirmDelete";
import { StarSummary } from "~/features/drawer/components/StarSummary";
import { GeneralizeError } from "~/features/drawer/generalize.server";
import { MAX_STAR_TEXT } from "~/features/drawer/star";
import { generateStar, getStarQuota, saveStar, StarError, type StarFailure } from "~/features/drawer/star.server";
import { getLlm } from "~/lib/llm.server";
import { DrawerNav, Flash } from "~/features/drawer/components/DrawerNav";
import { TagChips } from "~/features/drawer/components/TagChips";
import { ICON, ui } from "~/features/drawer/components/ui";
import { DrawerWebError } from "~/features/drawer/drawer-web.server";
import { MAX_LOG_LENGTH, MAX_PROJECT_TITLE } from "~/features/drawer/limits";
import { QUESTIONS } from "~/features/drawer/messages";
import { composeLog } from "~/features/drawer/record.server";
import { requireConsentedSession } from "~/features/drawer/session.server";
import { formatTagInput, MAX_TAGS, normalizeTags, parseTagInput } from "~/features/drawer/tags";
import { kstDate } from "~/lib/kst";
import type { Route } from "./+types/drawer.books.$bookId";

const uuid = z.uuid();
const starText = z.string().trim().min(1).max(MAX_STAR_TEXT);

const STAR_ERRORS: Record<StarFailure, string> = {
  not_found: "정리할 책을 찾지 못했어요.",
  no_logs: "기록이 있어야 STAR로 정리할 수 있어요.",
  limit: "이 책은 이미 STAR를 정리했어요. 내용은 요약 페이지에서 직접 고쳐 저장할 수 있어요.",
  daily_limit: "STAR 정리는 하루 한 번이에요. 내일 다시 정리할 수 있어요.",
};

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("rename_book"), title: z.string().trim().min(1).max(MAX_PROJECT_TITLE) }),
  z.object({ intent: z.literal("move_book"), shelfId: z.union([z.literal(""), uuid]) }),
  z.object({ intent: z.literal("set_current") }),
  z.object({ intent: z.literal("update_log"), logId: uuid, content: z.string().trim().min(1).max(MAX_LOG_LENGTH) }),
  z.object({ intent: z.literal("update_tags"), logId: uuid, tags: z.string().max(400) }),
  z.object({ intent: z.literal("delete_log"), logId: uuid }),
  z.object({ intent: z.literal("generate_star") }),
  z.object({
    intent: z.literal("save_star"),
    situation: starText,
    task: starText,
    action: starText,
    result: starText,
  }),
  z.object({
    intent: z.literal("create_log"),
    logDate: z.string().refine((date) => isLoggableDate(date, kstDate(new Date())), "오늘이나 지난 날짜만 고를 수 있어요."),
    // The same three questions the bot asks; only the first is required.
    task: z.string().trim().min(1).max(MAX_LOG_LENGTH),
    role: z.string().trim().max(MAX_LOG_LENGTH).default(""),
    result: z.string().trim().max(MAX_LOG_LENGTH).default(""),
  }),
]);

type ActionResult = { error?: string; done?: string; created?: boolean };

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
  const session = await requireConsentedSession(request);
  if (!uuid.safeParse(params.bookId).success) throw data("책을 찾을 수 없어요.", { status: 404 });
  // One round of parallel queries: the book, only the shelf names (not the whole bookshelf), its STAR and quota.
  // getStar is scoped by RLS, so it returns null for a book that is not the user's.
  const [detail, shelves, star, starQuota] = await Promise.all([
    session.store.getBook(params.bookId),
    session.store.listShelves(),
    session.store.getStar(params.bookId),
    getStarQuota(session.store),
  ]);
  if (!detail) throw data("책을 찾을 수 없어요.", { status: 404 });
  // Today in KST from the server, so the date picker never defaults to the browser's timezone.
  return data({ ...detail, shelves, star, starQuota, isDemo: session.isDemo, today: kstDate(new Date()) }, { headers: session.headers });
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
      case "create_log":
        await store.createLog(bookId, input.logDate, composeLog({ task: input.task, role: input.role || null, result: input.result || null }));
        return data<ActionResult>({ done: "기록을 넣었어요.", created: true }, { headers });
      case "generate_star":
        await generateStar(store, getLlm(), bookId);
        return data<ActionResult>({ done: "STAR를 정리했어요. 빈칸과 근거를 확인하고 저장해 주세요." }, { headers });
      case "save_star": {
        const { intent: _intent, ...fields } = input;
        await saveStar(store, bookId, fields);
        return data<ActionResult>({ done: "STAR를 저장했어요." }, { headers });
      }
    }
  } catch (error) {
    if (error instanceof StarError) return data<ActionResult>({ error: STAR_ERRORS[error.reason] }, { status: 400, headers });
    if (error instanceof GeneralizeError) {
      console.error("star generation failed", error.reason);
      return data<ActionResult>({ error: "지금은 정리하지 못했어요. 잠시 뒤 다시 시도해 주세요." }, { status: 502, headers });
    }
    if (!(error instanceof DrawerWebError)) throw error;
    console.error("book action failed", input.intent, error.code ?? "");
    return data<ActionResult>({ error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500, headers });
  }
}

const warning = "flex items-start gap-1.5 text-xs leading-relaxed text-muted";

type LogField = "task" | "role" | "result";

/** The bot's three questions, split into the prompt and its example for the guide column. */
const LOG_STEPS = ([1, 2, 3] as const).map((step) => {
  const [question, example] = QUESTIONS[step].split("\n");
  return {
    step,
    field: (["task", "role", "result"] as const)[step - 1] satisfies LogField,
    question: question.replace(/^\d\/3\s*/, ""),
    example: example?.replace(/^예\)\s*/, "") ?? "",
    isRequired: step === 1,
  };
});

function NewLogForm({ today, busy, created }: { today: string; busy: boolean; created?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  // Clear the form after each successful save so the next entry starts empty.
  useEffect(() => {
    if (created) formRef.current?.reset();
  }, [created]);

  return (
    <details className="group border-t border-line pt-5">
      <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md border border-brass/60 bg-brass-soft px-3.5 py-2 text-sm font-semibold text-ink transition hover:border-brass active:translate-y-px [&::-webkit-details-marker]:hidden">
        <PenLine {...ICON} aria-hidden className="text-brass" />
        기록 직접 쓰기
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="transition group-open:rotate-180" />
      </summary>
      <Form ref={formRef} method="post" className="mt-5 flex flex-col gap-5">
        <input type="hidden" name="intent" value="create_log" />
        <label className="flex w-fit flex-col gap-1">
          <span className={ui.label}>날짜</span>
          <input type="date" name="logDate" defaultValue={today} max={today} required className={ui.input} />
        </label>
        <ol className="flex flex-col gap-5">
          {LOG_STEPS.map(({ step, field, question, example, isRequired }) => (
            <li key={field} className="grid gap-2 md:grid-cols-[17rem_1fr] md:gap-6">
              <div className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-brass text-xs font-semibold text-brass tabular-nums"
                >
                  {step}
                </span>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`new-log-${field}`} className="text-sm leading-snug font-semibold">
                    {question}
                    <span className="ml-1.5 text-xs font-normal text-faint">{isRequired ? "필수" : "선택"}</span>
                  </label>
                  <p className="text-xs leading-relaxed text-muted">예) {example}</p>
                </div>
              </div>
              <textarea
                id={`new-log-${field}`}
                name={field}
                rows={step === 1 ? 3 : 2}
                maxLength={MAX_LOG_LENGTH}
                required={isRequired}
                className={`${ui.input} w-full leading-relaxed`}
              />
            </li>
          ))}
        </ol>
        <p className={warning}>
          <TriangleAlert size={14} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-brass" />
          쓴 그대로 저장돼요. 고객사명·내부 시스템명·절대 수치는 빼고 써 주세요. 세 답은 텔레그램 기록과 같은 모양으로 합쳐져요.
        </p>
        <button type="submit" disabled={busy} className={`${ui.primary} w-fit`}>
          기록 넣기
        </button>
      </Form>
    </details>
  );
}

function monthLabel(month: string) {
  return `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;
}

export default function Book({ loaderData, actionData }: Route.ComponentProps) {
  const { book, logs, shelves, star, starQuota, isDemo, today } = loaderData;
  const busy = useNavigation().state !== "idle";
  const months = groupByMonth(logs);
  const shelfName = shelves.find((shelf) => shelf.id === book.shelfId)?.name ?? NEW_SHELF_LABEL;

  return (
    <main className="min-h-screen bg-ground text-ink">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
        <DrawerNav isDemo={isDemo} />
        <Link to="/drawer" viewTransition aria-label="책장으로 돌아가기" className={`${ui.ghost} -ml-2.5 w-fit`}>
          <ArrowLeft {...ICON} aria-hidden />
          책장
        </Link>

        <header className="flex gap-5">
          {/* The cover from the shelf lands here (shared view-transition name). */}
          <span
            aria-hidden
            className={`relative h-28 w-20 shrink-0 overflow-hidden rounded-r-sm rounded-l-xs ${spineColor(book.id)} shadow-[0_12px_22px_-10px_rgba(0,0,0,0.6)]`}
            style={{ viewTransitionName: bookTransitionName(book.id) }}
          >
            <span className="absolute inset-y-0 left-1.5 w-0.5 bg-black/25" />
            <span className="absolute inset-0 bg-[linear-gradient(105deg,rgba(255,255,255,0.10),transparent_40%,rgba(0,0,0,0.22))]" />
            <span className="absolute inset-x-2 top-2.5 line-clamp-2 rounded-xs bg-label px-1.5 py-1 text-[9px] leading-tight font-bold break-keep text-label-ink">
              {book.title}
            </span>
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <h1 className="text-3xl leading-[1.3] font-bold tracking-title break-keep">{book.title}</h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
              {book.isCurrent && (
                <span className="inline-flex items-center rounded-full bg-brass py-0.5 pr-2.5 pl-1 text-xs font-semibold text-brass-ink">
                  <Dot size={16} strokeWidth={4} aria-hidden />
                  진행 중
                </span>
              )}
              {star && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok">
                  <BookCheck size={14} strokeWidth={1.5} aria-hidden />
                  완결
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <CalendarRange {...ICON} aria-hidden />
                {formatPeriod(book)}
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <FileText {...ICON} aria-hidden />
                기록 {book.logCount}개
              </span>
              <span className="inline-flex items-center gap-1.5">
                <LibraryBig {...ICON} aria-hidden />
                {shelfName}
              </span>
            </p>
            <TagChips tags={book.topTags} />
            <details className="group mt-1">
              <summary className={`${ui.disclosure} inline-flex items-center gap-1`}>
                책 관리
                <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="transition group-open:rotate-180" />
              </summary>
              <div className="mt-2 flex flex-col gap-2 md:flex-row md:flex-wrap">
                <Form method="post" className="flex min-w-0 gap-2">
                  <input type="hidden" name="intent" value="rename_book" />
                  <input name="title" defaultValue={book.title} maxLength={MAX_PROJECT_TITLE} required aria-label="책 이름" className={`${ui.input} flex-1`} />
                  <button type="submit" disabled={busy} className={ui.secondary}>
                    이름 바꾸기
                  </button>
                </Form>
                <Form method="post" className="flex min-w-0 gap-2">
                  <input type="hidden" name="intent" value="move_book" />
                  <select name="shelfId" defaultValue={book.shelfId ?? ""} aria-label="칸으로 이동" className={`${ui.input} flex-1`}>
                    <option value="">{NEW_SHELF_LABEL}</option>
                    {shelves.map((shelf) => (
                      <option key={shelf.id} value={shelf.id}>
                        {shelf.name.slice(0, MAX_SHELF_NAME)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" disabled={busy} className={ui.secondary}>
                    칸으로 이동
                  </button>
                </Form>
                {!book.isCurrent && (
                  <Form method="post">
                    <button name="intent" value="set_current" disabled={busy} className={ui.secondary}>
                      현재 프로젝트로
                    </button>
                  </Form>
                )}
              </div>
            </details>
          </div>
        </header>

        <Flash error={actionData?.error} done={actionData?.done} />
        <StarSummary star={star} logs={logs} busy={busy} quota={starQuota} />
        <NewLogForm today={today} busy={busy} created={actionData?.created} />

        {logs.length === 0 ? (
          <p className={`${ui.panel} p-6 text-sm leading-relaxed text-muted`}>
            아직 기록이 없어요. 위에서 직접 쓰거나, 현재 프로젝트로 정하고 텔레그램으로 보내 보세요.
          </p>
        ) : (
          <div className="flex flex-col gap-6 md:grid md:grid-cols-[8rem_1fr] md:items-start md:gap-10">
            <nav aria-label="목차" className="md:sticky md:top-6">
              <h2 className={`${ui.label} mb-2 hidden md:block`}>목차</h2>
              <ol className="flex gap-1 overflow-x-auto md:flex-col md:border-l md:border-line">
                {months.map(({ month, logs: monthLogs }) => (
                  <li key={month} className="shrink-0">
                    <a
                      href={`#m-${month}`}
                      className="flex items-baseline justify-between gap-3 rounded-md px-2.5 py-1 text-sm whitespace-nowrap text-muted tabular-nums transition hover:text-ink md:-ml-px md:rounded-none md:border-l md:border-transparent md:hover:border-brass"
                    >
                      {month.replace("-", ".")} <span className="text-xs text-faint">{monthLogs.length}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="flex min-w-0 flex-col gap-10">
              {months.map(({ month, logs: monthLogs }) => (
                <section key={month} id={`m-${month}`} className="scroll-mt-6" aria-label={monthLabel(month)}>
                  <h2 className="mb-1 border-b border-line pb-2 text-xl font-semibold tracking-title">{monthLabel(month)}</h2>
                  <ol className="flex flex-col divide-y divide-line">
                    {monthLogs.map((log) => (
                      <li
                        key={log.id}
                        id={`log-${log.id}`}
                        data-testid="log"
                        className="grid scroll-mt-6 gap-2 py-4 transition target:bg-brass-soft/50 sm:grid-cols-[3.5rem_1fr] sm:gap-4"
                      >
                        <div className="flex items-baseline gap-2 text-xs text-faint sm:flex-col sm:gap-1">
                          <time dateTime={log.logDate} className="text-sm font-semibold text-muted tabular-nums">
                            {log.logDate.slice(5).replace("-", ".")}
                          </time>
                          {log.edited && <span>직접 수정</span>}
                        </div>
                        <div className="flex min-w-0 flex-col gap-2">
                          <p className="max-w-[70ch] text-[0.95rem] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{log.content}</p>
                          <TagChips tags={log.tags} />
                          {/* Keyed by content and tags so the editor collapses after a successful save. */}
                          <details key={`${log.content}|${log.tags.join(",")}`}>
                            <summary className={`${ui.disclosure} w-fit text-xs`}>수정·삭제</summary>
                            <div className="mt-2 flex flex-col gap-3">
                              <Form method="post" className="flex flex-col gap-2">
                                <input type="hidden" name="intent" value="update_log" />
                                <input type="hidden" name="logId" value={log.id} />
                                <textarea name="content" defaultValue={log.content} maxLength={MAX_LOG_LENGTH} required rows={3} aria-label="기록 내용" className={`${ui.input} leading-relaxed`} />
                                <p className={warning}>
                                  <TriangleAlert size={14} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-brass" />
                                  고친 글은 그대로 저장돼요. 고객사명·내부 시스템명·절대 수치는 빼고 써 주세요.
                                </p>
                                <button type="submit" disabled={busy} className={`${ui.primary} w-fit`}>
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
                                  className={`${ui.input} flex-1`}
                                />
                                <button type="submit" disabled={busy} className={ui.secondary}>
                                  태그 저장
                                </button>
                              </Form>
                              <p className="text-xs text-faint">태그는 최대 {MAX_TAGS}개, 각 30자까지예요.</p>
                              <ConfirmDelete
                                label="삭제"
                                question="이 기록을 지울까요? 되돌릴 수 없어요."
                                intent="delete_log"
                                fields={{ logId: log.id }}
                                busy={busy}
                              />
                            </div>
                          </details>
                        </div>
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
