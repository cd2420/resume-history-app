import { Check, ChevronDown, Send } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { type ConsentTerm, versionField } from "~/features/drawer/consent";
import type { action as settingsAction } from "~/routes/drawer.settings";

import { ICON, ui } from "./ui";

const SETTINGS = "/drawer/settings";
const SUGGESTED_HOUR = 21;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Reloads page data when the user comes back from Telegram, so "연결됨" shows without a manual refresh. */
function useRevalidateOnReturn() {
  const { revalidate } = useRevalidator();
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [revalidate]);
}

type ConnectProps = { isDemo: boolean; botUsername: string; term: ConsentTerm };

/** Issues a one-time deep link through the settings action and shows the button that opens the bot. */
export function TelegramConnect({ isDemo, botUsername, term }: ConnectProps) {
  const fetcher = useFetcher<typeof settingsAction>();
  const deepLink = fetcher.data?.deepLink;
  const isIssuing = fetcher.state !== "idle";
  useRevalidateOnReturn();

  if (deepLink) {
    return (
      <div className="flex flex-col gap-2">
        <a
          href={deepLink}
          target={isDemo ? undefined : "_blank"}
          rel="noopener noreferrer"
          data-testid="deep-link"
          className={`${ui.primary} w-fit`}
        >
          <Send {...ICON} aria-hidden />
          {isDemo ? "봇 시뮬레이터에서 연결하기" : `텔레그램에서 @${botUsername} 열기`}
        </a>
        <p className="text-xs leading-relaxed text-muted">
          봇 화면에서 <b>시작</b>을 누르면 연결돼요. 이 화면으로 돌아오면 자동으로 반영돼요. 링크는 9분 안에 한 번만 쓸 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <fetcher.Form method="post" action={SETTINGS} className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 rounded-md border border-line bg-sunken p-3 text-xs leading-relaxed">
        <p className="font-semibold">{term.title}</p>
        <ul className="list-disc pl-4 text-muted">
          {term.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <input type="hidden" name={versionField(term.kind)} value={term.version} />
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input type="checkbox" name={term.kind} required className="size-4 accent-[var(--brass)]" />
          <span>동의합니다</span>
        </label>
      </div>
      <button name="intent" value="connect" disabled={isIssuing} className={`${ui.primary} w-fit`}>
        <Send {...ICON} aria-hidden />
        {isIssuing ? "링크 만드는 중…" : "텔레그램 연결하기"}
      </button>
      {fetcher.data?.error && (
        <p role="alert" className="text-xs text-danger">
          {fetcher.data.error}
        </p>
      )}
    </fetcher.Form>
  );
}

function NotifyHourStep({ notifyHour }: { notifyHour: number | null }) {
  const fetcher = useFetcher<typeof settingsAction>();
  const isSaving = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post" action={SETTINGS} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="intent" value="notify_hour" />
      <select
        name="hour"
        aria-label="알림 시간"
        defaultValue={String(notifyHour ?? SUGGESTED_HOUR)}
        className={ui.input}
      >
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>
            매일 {String(hour).padStart(2, "0")}:00
          </option>
        ))}
      </select>
      <button type="submit" disabled={isSaving} className={ui.primary}>
        {isSaving ? "저장 중…" : "이 시간에 받기"}
      </button>
    </fetcher.Form>
  );
}

function Step({ n, isDone, title, children }: { n: number; isDone: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
          isDone ? "bg-ok-soft text-ok" : "border border-brass text-brass"
        }`}
      >
        {isDone ? <Check size={14} strokeWidth={2.25} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className={`text-sm font-semibold ${isDone ? "text-faint" : "text-ink"}`}>
          {title}
          {isDone && <span className="ml-1.5 font-normal">완료</span>}
        </p>
        {!isDone && children}
      </div>
    </li>
  );
}

type SetupProps = ConnectProps & { isLinked: boolean; notifyHour: number | null };

/** First-run checklist on the bookshelf: connect Telegram, then pick the daily prompt hour. Hidden once both are done. */
export function TelegramSetup({ isLinked, notifyHour, isDemo, botUsername, term }: SetupProps) {
  if (isLinked && notifyHour !== null) return null;
  const remaining = Number(!isLinked) + Number(notifyHour === null);
  return (
    <details aria-label="시작하기" data-testid="telegram-setup" className={`group ${ui.panel} px-4 py-3`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate text-sm font-semibold">
          시작하기{" "}
          <span className="font-normal text-muted tabular-nums">
            · {remaining}단계 남음 · {isLinked ? "질문 받을 시간 고르기" : "텔레그램 연결"}
          </span>
        </span>
        <ChevronDown {...ICON} aria-hidden className="shrink-0 text-muted transition group-open:rotate-180" />
      </summary>
      <p className="mt-3 text-xs text-muted">정한 시간에 텔레그램으로 오늘 한 일을 먼저 물어볼게요. 답하면 이 책장에 기록이 쌓여요.</p>
      <ol className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
        <Step n={1} isDone={isLinked} title="텔레그램 연결">
          <TelegramConnect isDemo={isDemo} botUsername={botUsername} term={term} />
        </Step>
        <Step n={2} isDone={notifyHour !== null} title="질문 받을 시간 고르기">
          {isLinked ? (
            <NotifyHourStep notifyHour={notifyHour} />
          ) : (
            <p className="text-xs text-muted">텔레그램을 연결하면 고를 수 있어요.</p>
          )}
        </Step>
      </ol>
    </details>
  );
}
