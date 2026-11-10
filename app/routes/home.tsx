import { data, Link, redirect } from "react-router";

import { createSupabase } from "~/lib/supabase.server";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "이력서랍" },
    { name: "description", content: "오늘 한 일, 서랍에 넣어두세요. 이력서는 이력서랍이 꺼내드릴게요." },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabase(request);
  const { data: auth } = await supabase.auth.getClaims();
  if (auth?.claims.sub) throw redirect("/drawer", { headers });
  return data(null, { headers });
}

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4 text-slate-50">
      <div className="flex w-full max-w-sm flex-col gap-6 text-center">
        <h1 className="text-3xl font-bold">🗄️ 이력서랍</h1>
        <p className="text-slate-300">
          오늘 한 일, 서랍에 넣어두세요.
          <br />
          정한 시간에 텔레그램으로 먼저 물어볼게요.
        </p>
        <div className="flex flex-col gap-2">
          <Link to="/signup" className="rounded bg-sky-600 py-2 font-semibold">
            가입하기
          </Link>
          <Link to="/login" className="rounded bg-slate-700 py-2">
            로그인
          </Link>
        </div>
      </div>
    </main>
  );
}
