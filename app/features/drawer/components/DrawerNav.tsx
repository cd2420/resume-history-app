import { Form, NavLink } from "react-router";

const link = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm ${isActive ? "bg-slate-700 font-semibold text-white" : "text-slate-300 hover:bg-slate-800"}`;

export function DrawerNav({ isDemo }: { isDemo: boolean }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <NavLink to="/drawer" end className="text-xl font-bold">
        🗄️ 이력서랍
      </NavLink>
      <nav className="flex flex-wrap items-center gap-1" aria-label="이력서랍 메뉴">
        <NavLink to="/drawer" end className={link}>
          책장
        </NavLink>
        <NavLink to="/drawer/settings" className={link}>
          설정
        </NavLink>
        {isDemo && (
          <NavLink to="/drawer/demo-bot" className={link}>
            봇 시뮬레이터
          </NavLink>
        )}
        <Form method="post" action="/logout">
          <button type="submit" className="px-2 py-1.5 text-sm text-slate-400 underline">
            로그아웃
          </button>
        </Form>
      </nav>
    </header>
  );
}

export function Flash({ error, done }: { error?: string | null; done?: string | null }) {
  if (error) {
    return (
      <p role="alert" className="rounded bg-red-950 px-3 py-2 text-sm text-red-300">
        {error}
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className="rounded bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
        {done}
      </p>
    );
  }
  return null;
}
