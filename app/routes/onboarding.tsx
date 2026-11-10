import { useEffect, useRef, useState } from "react";
import { data, Form, Link, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { CareerError, saveProjectDraft } from "~/features/career/career.server";
import { DraftCard } from "~/features/interview/DraftCard";
import { extractDraft, InterviewError, nextQuestion } from "~/features/interview/interview.server";
import { type ChatTurn, chatTurnsSchema, type ProjectDraft, projectDraftSchema } from "~/features/interview/schema";
import { requireDemoUser } from "~/features/demo/demo-auth.server";
import { getDemoStore } from "~/features/demo/demo-store.server";
import { getEnv } from "~/lib/env.server";
import { getLlm } from "~/lib/llm.server";
import { requireUser } from "~/lib/supabase.server";
import type { Route } from "./+types/onboarding";

// Static opener so loading the page never costs an LLM call.
const FIRST_QUESTION = "어느 회사의 어떤 프로젝트부터 이야기해 볼까요?";

const requestSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("ask"), turns: chatTurnsSchema }),
  z.object({ intent: z.literal("draft"), turns: chatTurnsSchema }),
  z.object({ intent: z.literal("save"), draft: z.unknown() }),
]);

type InterviewRequest =
  | { intent: "ask" | "draft"; turns: ChatTurn[] }
  | { intent: "save"; draft: ProjectDraft };

const INTERVIEW_MESSAGES: Record<InterviewError["reason"], string> = {
  empty: "먼저 질문에 답해 주세요.",
  truncated: "AI 응답이 길어서 끊겼습니다. 다시 시도해 주세요.",
  refused: "AI가 이 내용에 답하지 않았습니다. 표현을 바꿔 다시 시도해 주세요.",
  invalid: "AI 응답을 읽지 못했습니다. 다시 시도해 주세요.",
  api: "AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

const CAREER_MESSAGES: Record<CareerError["reason"], string> = {
  invalid: "초안에 잘못된 값이 있습니다. 회사명·프로젝트명·한 일과 기간 순서를 확인해 주세요.",
  db: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

// Logs only the failure kind and HTTP status; conversation text never reaches logs.
function toUserError(error: unknown): { message: string; status: number } {
  const causeStatus = (error as { cause?: { status?: number } }).cause?.status;
  if (error instanceof InterviewError) {
    console.error("interview failed", error.reason, causeStatus ?? "");
    return { message: INTERVIEW_MESSAGES[error.reason], status: error.reason === "empty" ? 400 : 502 };
  }
  if (error instanceof CareerError) {
    console.error("career save failed", error.reason, (error.cause as { code?: string })?.code ?? "");
    return { message: CAREER_MESSAGES[error.reason], status: error.reason === "invalid" ? 400 : 500 };
  }
  throw error;
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "경력 인터뷰" }];
}

// Demo mode has no Supabase session: a demo cookie stands in and saving goes to memory.
async function authenticate(request: Request) {
  if (getEnv().isDemo) return { ...requireDemoUser(request), supabase: null };
  return requireUser(request);
}

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await authenticate(request);
  return data(null, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  // Auth first: every request may spend LLM credits or write career data.
  const { supabase, userId, headers } = await authenticate(request);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return data({ error: "요청 형식이 올바르지 않습니다." }, { status: 400, headers });
  }

  const input = parsed.data;
  try {
    if (input.intent === "ask") {
      return data({ question: await nextQuestion(getLlm(), input.turns) }, { headers });
    }
    if (input.intent === "draft") {
      return data({ draft: await extractDraft(getLlm(), input.turns) }, { headers });
    }
    if (!supabase) {
      const draft = projectDraftSchema.safeParse(input.draft);
      if (!draft.success) return data({ error: CAREER_MESSAGES.invalid }, { status: 400, headers });
      getDemoStore().addDraftProject(userId, draft.data);
    } else {
      await saveProjectDraft(supabase, input.draft);
    }
  } catch (error) {
    const { message, status } = toUserError(error);
    return data({ error: message }, { status, headers });
  }
  // The saved project shows up on the bookshelf's "newly shelved" shelf.
  throw redirect("/drawer", { headers });
}

export default function Onboarding() {
  const fetcher = useFetcher<typeof action>();
  const [turns, setTurns] = useState<ChatTurn[]>([{ role: "assistant", content: FIRST_QUESTION }]);
  const [answer, setAnswer] = useState("");
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [lastRequest, setLastRequest] = useState<InterviewRequest | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isBusy = fetcher.state !== "idle";
  const hasAnswers = turns.some((turn) => turn.role === "user");
  const result = fetcher.data;
  const error = !isBusy && result && "error" in result ? result.error : undefined;

  useEffect(() => {
    if (!result) return;
    if ("question" in result) setTurns((prev) => [...prev, { role: "assistant", content: result.question }]);
    if ("draft" in result) setDraft(result.draft);
  }, [result]);

  // The conversation lives only in this tab (raw answers are never stored), so warn before losing it.
  useEffect(() => {
    if (!hasAnswers) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasAnswers]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, isBusy]);

  function send(request: InterviewRequest) {
    setLastRequest(request);
    fetcher.submit(request, { method: "post", encType: "application/json" });
  }

  function handleAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = answer.trim();
    if (!content || isBusy) return;
    const next: ChatTurn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setAnswer("");
    send({ intent: "ask", turns: next });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col bg-slate-900 text-slate-50">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h1 className="font-bold">경력 인터뷰</h1>
        <nav className="flex gap-3 text-sm text-slate-400">
          <Link to="/drawer" className="underline">
            책장
          </Link>
          <Form method="post" action="/logout">
            <button type="submit" className="underline">
              로그아웃
            </button>
          </Form>
        </nav>
      </header>

      {draft ? (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <DraftCard
            draft={draft}
            onChange={setDraft}
            onBack={() => setDraft(null)}
            onSave={() => send({ intent: "save", draft })}
            isSaving={isBusy}
            error={error}
          />
        </div>
      ) : (
        <>
          <ol aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {turns.map((turn, index) => (
              <li
                key={index}
                className={
                  turn.role === "assistant"
                    ? "max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-slate-800 px-4 py-2"
                    : "max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-sky-700 px-4 py-2"
                }
              >
                <span className="sr-only">{turn.role === "assistant" ? "질문: " : "내 답변: "}</span>
                {turn.content}
              </li>
            ))}
            {isBusy && <li className="self-start text-sm text-slate-400">생각하는 중…</li>}
            <div ref={bottomRef} />
          </ol>

          <div className="flex flex-col gap-2 border-t border-slate-800 px-4 py-3">
            {error && (
              <div role="alert" className="flex items-center justify-between gap-2 text-sm text-red-400">
                <span>{error}</span>
                {lastRequest && (
                  <button type="button" onClick={() => send(lastRequest)} className="shrink-0 underline">
                    다시 시도
                  </button>
                )}
              </div>
            )}
            <form onSubmit={handleAnswer} className="flex gap-2">
              <label htmlFor="answer" className="sr-only">
                답변
              </label>
              <textarea
                id="answer"
                rows={2}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="편하게 떠오르는 대로 적어 주세요"
                className="flex-1 resize-none rounded bg-slate-800 px-3 py-2 text-base"
              />
              <button
                type="submit"
                disabled={isBusy || !answer.trim()}
                className="rounded bg-sky-600 px-4 font-semibold disabled:opacity-50"
              >
                보내기
              </button>
            </form>
            <button
              type="button"
              onClick={() => send({ intent: "draft", turns })}
              disabled={isBusy || !hasAnswers}
              className="rounded border border-slate-600 py-2 text-sm disabled:opacity-40"
            >
              이 프로젝트 정리하기
            </button>
          </div>
        </>
      )}
    </main>
  );
}
