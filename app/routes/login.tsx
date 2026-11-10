import { data, Form, Link, redirect, useNavigation } from "react-router";
import { z } from "zod";

import { demoLoginHeaders, hasDemoSession } from "~/features/demo/demo-auth.server";
import { getEnv } from "~/lib/env.server";
import { createSupabase } from "~/lib/supabase.server";
import type { Route } from "./+types/login";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

const LOGIN_FAILED = "이메일 또는 비밀번호가 올바르지 않습니다.";

export function meta({}: Route.MetaArgs) {
  return [{ title: "로그인" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (getEnv().isDemo) {
    if (hasDemoSession(request)) throw redirect("/drawer");
    return data({ isDemo: true });
  }
  const { supabase, headers } = createSupabase(request);
  const { data: auth } = await supabase.auth.getClaims();
  if (auth?.claims.sub) {
    throw redirect("/drawer", { headers });
  }
  return data({ isDemo: false }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const parsed = credentialsSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) {
    return data({ error: LOGIN_FAILED }, { status: 400 });
  }

  // Demo mode: any well-formed email and password signs in to the sample data.
  if (getEnv().isDemo) throw redirect("/drawer", { headers: demoLoginHeaders() });

  const { supabase, headers } = createSupabase(request);
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Supabase error codes only; never log the submitted credentials.
    console.error("login failed", error.code ?? error.status);
    return data({ error: LOGIN_FAILED }, { status: 400, headers });
  }
  throw redirect("/drawer", { headers });
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const isSubmitting = useNavigation().state === "submitting";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4 text-slate-50">
      <Form method="post" className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-bold">로그인</h1>
        {loaderData?.isDemo && (
          <p className="rounded bg-amber-950 px-3 py-2 text-sm text-amber-300">
            데모 모드: 아무 이메일과 비밀번호로 로그인할 수 있어요.
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm">이메일</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded bg-slate-800 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">비밀번호</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="rounded bg-slate-800 px-3 py-2"
          />
        </label>
        {actionData?.error && (
          <p role="alert" className="text-sm text-red-400">
            {actionData.error}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-sky-600 py-2 font-semibold disabled:opacity-50"
        >
          {isSubmitting ? "로그인 중…" : "로그인"}
        </button>
        <p className="text-center text-sm text-slate-400">
          처음이신가요?{" "}
          <Link to="/signup" className="text-sky-400 underline">
            가입하기
          </Link>
        </p>
      </Form>
    </main>
  );
}
