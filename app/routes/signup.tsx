import { data, Form, Link, redirect, useNavigation } from "react-router";
import { z } from "zod";

import { demoLoginHeaders, hasDemoSession } from "~/features/demo/demo-auth.server";
import { getEnv } from "~/lib/env.server";
import { createSupabase } from "~/lib/supabase.server";
import type { Route } from "./+types/signup";

const signupSchema = z
  .object({
    email: z.email(),
    // Supabase hashes with bcrypt, which reads at most 72 bytes.
    password: z.string().min(8).max(72),
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, { path: ["passwordConfirm"] });

export function meta({}: Route.MetaArgs) {
  return [{ title: "가입 · 이력서랍" }];
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

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const parsed = signupSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    passwordConfirm: form.get("passwordConfirm"),
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.path[0] === "passwordConfirm");
    return data(
      { error: mismatch ? "비밀번호가 서로 다릅니다." : "이메일과 8자 이상 비밀번호를 입력해 주세요.", sent: false },
      { status: 400 },
    );
  }

  // Demo mode: no account is created; the visitor goes straight to the consent screen.
  if (getEnv().isDemo) throw redirect("/drawer/consent", { headers: demoLoginHeaders() });

  const { supabase, headers } = createSupabase(request);
  const { data: result, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${getEnv().APP_URL}/login` },
  });
  if (error) {
    // Error code only; never log the submitted credentials.
    console.error("signup failed", error.code ?? error.status);
    return data({ error: "가입하지 못했습니다. 잠시 후 다시 시도해 주세요.", sent: false }, { status: 400, headers });
  }
  // With email confirmation off, Supabase signs the user in immediately.
  if (result.session) throw redirect("/drawer/consent", { headers });
  return data({ error: null, sent: true }, { headers });
}

export default function Signup({ actionData }: Route.ComponentProps) {
  // formData stays set through the redirect's loading phase, so the button stays disabled until the next page.
  const isSubmitting = useNavigation().formData != null;

  if (actionData?.sent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4 text-slate-50">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <h1 className="text-2xl font-bold">메일을 확인해 주세요</h1>
          <p className="text-slate-300">인증 메일의 링크를 누른 뒤 로그인하면 텔레그램을 연결할 수 있어요.</p>
          <Link to="/login" className="rounded bg-sky-600 py-2 text-center font-semibold">
            로그인으로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4 text-slate-50">
      <Form method="post" className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-bold">이력서랍 가입</h1>
        <label className="flex flex-col gap-1">
          <span className="text-sm">이메일</span>
          <input name="email" type="email" autoComplete="email" required className="rounded bg-slate-800 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">비밀번호 (8자 이상)</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            className="rounded bg-slate-800 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">비밀번호 확인</span>
          <input
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            required
            className="rounded bg-slate-800 px-3 py-2"
          />
        </label>
        {actionData?.error && (
          <p role="alert" className="text-sm text-red-400">
            {actionData.error}
          </p>
        )}
        <button type="submit" disabled={isSubmitting} className="rounded bg-sky-600 py-2 font-semibold disabled:opacity-50">
          {isSubmitting ? "가입 중…" : "가입하기"}
        </button>
        <p className="text-center text-sm text-slate-400">
          이미 계정이 있나요?{" "}
          <Link to="/login" className="text-sky-400 underline">
            로그인
          </Link>
        </p>
      </Form>
    </main>
  );
}
