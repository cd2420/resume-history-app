import { data, Form, Link, redirect, useNavigation } from "react-router";

import { signupErrorMessage } from "~/features/auth/auth-messages";
import { AuthShell } from "~/features/drawer/components/AuthShell";
import { ui } from "~/features/drawer/components/ui";
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
    return data({ error: signupErrorMessage(error.code), sent: false }, { status: 400, headers });
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
      <AuthShell>
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold tracking-title">메일을 확인해 주세요</h1>
          <p className="text-sm leading-relaxed text-muted">인증 메일의 링크를 누른 뒤 로그인하면 텔레그램을 연결할 수 있어요.</p>
          {/* Same text whether or not the address already had an account, so sign-up cannot be used to probe emails. */}
          <p className="text-sm leading-relaxed text-muted">
            메일이 오지 않으면 이미 가입된 이메일일 수 있어요. 로그인해 보세요. 인증을 마치지 않은 계정이면 로그인 화면에서 인증 메일을 다시 받을 수
            있어요.
          </p>
          <Link to="/login" className={`${ui.primary} py-2.5`}>
            로그인으로
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Form method="post" className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold tracking-title">가입하기</h1>
        <label className="flex flex-col gap-1">
          <span className={ui.label}>이메일</span>
          <input name="email" type="email" autoComplete="email" required className={`${ui.input} py-2.5`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={ui.label}>비밀번호 (8자 이상)</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            className={`${ui.input} py-2.5`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={ui.label}>비밀번호 확인</span>
          <input
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            required
            className={`${ui.input} py-2.5`}
          />
        </label>
        {actionData?.error && (
          <p role="alert" className="text-sm text-danger">
            {actionData.error}
          </p>
        )}
        <button type="submit" disabled={isSubmitting} className={`${ui.primary} py-2.5`}>
          {isSubmitting ? "가입 중…" : "가입하기"}
        </button>
        <p className="text-center text-sm text-muted">
          이미 계정이 있나요?{" "}
          <Link to="/login" className="font-semibold text-brass underline">
            로그인
          </Link>
        </p>
      </Form>
    </AuthShell>
  );
}
