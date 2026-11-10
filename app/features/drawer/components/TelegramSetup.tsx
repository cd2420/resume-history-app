import { type ReactNode, useEffect } from "react";
import { useFetcher, useRevalidator } from "react-router";

import type { action as settingsAction } from "~/routes/drawer.settings";

const SETTINGS = "/drawer/settings";
const SUGGESTED_HOUR = 21;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const button = "shrink-0 whitespace-nowrap rounded bg-sky-600 px-3 py-2 text-sm font-semibold disabled:opacity-50";

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

type ConnectProps = { isDemo: boolean; botUsername: string };

/** Issues a one-time deep link through the settings action and shows the button that opens the bot. */
export function TelegramConnect({ isDemo, botUsername }: ConnectProps) {
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
          className={`${button} text-center`}
        >
          {isDemo ? "봇 시뮬레이터에서 연결하기" : `텔레그램에서 @${botUsername} 열기`}
        </a>
        <p className="text-xs text-slate-400">
          봇 화면에서 <b>시작</b>을 누르면 연결돼요. 이 화면으로 돌아오면 자동으로 반영돼요. 링크는 9분 안에 한 번만 쓸 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <fetcher.Form method="post" action={SETTINGS} className="flex flex-col gap-1">
      <button name="intent" value="connect" disabled={isIssuing} className={button}>
        {isIssuing ? "링크 만드는 중…" : "텔레그램 연결하기"}
      </button>
      {fetcher.data?.error && (
        <p role="alert" className="text-xs text-red-400">
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
        className="min-w-0 rounded bg-slate-900 px-3 py-2 text-sm"
      >
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>
            매일 {String(hour).padStart(2, "0")}:00
          </option>
        ))}
      </select>
      <button type="submit" disabled={isSaving} className={button}>
        {isSaving ? "저장 중…" : "이 시간에 받기"}
      </button>
    </fetcher.Form>
  );
}

function Step({ n, isDone, title, children }: { n: number; isDone: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-2">
      <p className={`text-sm font-semibold ${isDone ? "text-slate-400 line-through" : ""}`}>
        {isDone ? "✅" : `${n}.`} {title}
      </p>
      {!isDone && children}
    </li>
  );
}

type SetupProps = ConnectProps & { isLinked: boolean; notifyHour: number | null };

/** First-run card on the bookshelf: connect Telegram, then pick the daily prompt hour. Hidden once both are done. */
export function TelegramSetup({ isLinked, notifyHour, isDemo, botUsername }: SetupProps) {
  if (isLinked && notifyHour !== null) return null;
  return (
    <section
      aria-label="시작하기"
      data-testid="telegram-setup"
      className="flex flex-col gap-3 rounded border border-sky-700 bg-slate-800 p-4"
    >
      <div>
        <h2 className="text-lg font-semibold">시작하기</h2>
        <p className="text-sm text-slate-300">정한 시간에 텔레그램으로 오늘 한 일을 먼저 물어볼게요. 답하면 이 책장에 기록이 쌓여요.</p>
      </div>
      <ol className="flex flex-col gap-4">
        <Step n={1} isDone={isLinked} title="텔레그램 연결">
          <TelegramConnect isDemo={isDemo} botUsername={botUsername} />
        </Step>
        <Step n={2} isDone={notifyHour !== null} title="질문 받을 시간 고르기">
          {isLinked ? (
            <NotifyHourStep notifyHour={notifyHour} />
          ) : (
            <p className="text-xs text-slate-400">텔레그램을 연결하면 고를 수 있어요.</p>
          )}
        </Step>
      </ol>
    </section>
  );
}
