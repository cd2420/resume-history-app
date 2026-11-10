import type { ReactNode } from "react";

import { CabinetMark } from "./DrawerNav";

/** The quiet front door shared by home, login and sign-up: the cabinet, the name, the slogan, then the form. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-12 text-ink">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <CabinetMark />
          <div className="flex flex-col gap-1">
            <p className="text-2xl font-bold tracking-title">이력서랍</p>
            <p className="text-sm leading-relaxed text-muted">
              오늘 한 일, 서랍에 넣어두세요.
              <br />
              이력서는 이력서랍이 꺼내드릴게요.
            </p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
