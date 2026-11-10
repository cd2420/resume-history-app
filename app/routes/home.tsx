import { data, Link, redirect } from "react-router";

import { hasDemoSession } from "~/features/demo/demo-auth.server";
import { AuthShell } from "~/features/drawer/components/AuthShell";
import { ui } from "~/features/drawer/components/ui";
import { getEnv } from "~/lib/env.server";
import { createSupabase } from "~/lib/supabase.server";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "이력서랍" },
    { name: "description", content: "오늘 한 일, 서랍에 넣어두세요. 이력서는 이력서랍이 꺼내드릴게요." },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (getEnv().isDemo) {
    if (hasDemoSession(request)) throw redirect("/drawer");
    return data(null);
  }
  const { supabase, headers } = createSupabase(request);
  const { data: auth } = await supabase.auth.getClaims();
  if (auth?.claims.sub) throw redirect("/drawer", { headers });
  return data(null, { headers });
}

export default function Home() {
  return (
    <AuthShell>
      <h1 className="sr-only">이력서랍</h1>
      <p className="text-center text-sm leading-relaxed text-muted">정한 시간에 텔레그램으로 먼저 물어볼게요.</p>
      <div className="flex flex-col gap-2">
        <Link to="/signup" className={`${ui.primary} py-2.5`}>
          가입하기
        </Link>
        <Link to="/login" className={`${ui.secondary} py-2.5`}>
          로그인
        </Link>
      </div>
    </AuthShell>
  );
}
