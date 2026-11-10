import { Bot, CircleAlert, CircleCheck, LibraryBig, LogOut, Settings } from "lucide-react";
import { Form, NavLink } from "react-router";

import { ICON, ui } from "./ui";

const link = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-9 items-center gap-1.5 px-3 text-sm transition ${
    isActive ? "font-semibold text-ink shadow-[inset_0_-2px_0_var(--brass)]" : "text-muted hover:text-ink"
  }`;

/** A three-drawer cabinet with brass pulls: the 이력서랍 mark. */
export function CabinetMark() {
  return (
    <svg width="26" height="28" viewBox="0 0 26 28" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="24" height="26" rx="2.5" fill="var(--wood)" />
      {[3, 11, 19].map((y) => (
        <g key={y}>
          <rect x="3.5" y={y} width="19" height="6.5" rx="1" fill="var(--wood-dark)" />
          <rect x="10" y={y + 2.5} width="6" height="1.6" rx="0.8" fill="var(--brass)" />
        </g>
      ))}
    </svg>
  );
}

export function DrawerNav({ isDemo }: { isDemo: boolean }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <NavLink to="/drawer" end prefetch="intent" className="flex items-center gap-2.5" aria-label="이력서랍 책장">
        <CabinetMark />
        <span className="flex flex-col leading-tight">
          <span className="text-xl font-bold tracking-title">이력서랍</span>
          <span className="text-xs text-faint">오늘 한 일, 서랍에 넣어두세요. 이력서는 이력서랍이 꺼내드릴게요.</span>
        </span>
      </NavLink>
      <nav className="flex flex-wrap items-center gap-1" aria-label="이력서랍 메뉴">
        <NavLink to="/drawer" end prefetch="intent" className={link}>
          <LibraryBig {...ICON} aria-hidden />
          책장
        </NavLink>
        <NavLink to="/drawer/settings" prefetch="intent" className={link}>
          <Settings {...ICON} aria-hidden />
          설정
        </NavLink>
        {isDemo && (
          <NavLink to="/drawer/demo-bot" className={link}>
            <Bot {...ICON} aria-hidden />
            <span className="max-sm:sr-only">봇 시뮬레이터</span>
          </NavLink>
        )}
        <Form method="post" action="/logout">
          <button type="submit" className={ui.ghost}>
            <LogOut {...ICON} aria-hidden />
            <span className="max-sm:sr-only">로그아웃</span>
          </button>
        </Form>
      </nav>
    </header>
  );
}

const TOAST =
  "fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-lg border px-4 py-2.5 text-sm text-ink shadow-[0_16px_36px_-14px_rgba(0,0,0,0.6)] motion-safe:animate-[toast-in_200ms_ease-out]";

/** Action results float as a toast so they never push the page around. */
export function Flash({ error, done }: { error?: string | null; done?: string | null }) {
  if (error) {
    return (
      <p role="alert" className={`${TOAST} border-danger/40 bg-danger-soft`}>
        <CircleAlert {...ICON} aria-hidden className="shrink-0 text-danger" />
        {error}
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className={`${TOAST} border-ok/40 bg-raised`}>
        <CircleCheck {...ICON} aria-hidden className="shrink-0 text-ok" />
        {done}
      </p>
    );
  }
  return null;
}
