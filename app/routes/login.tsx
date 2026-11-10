import { data, Form, Link, redirect, useNavigation } from "react-router";

import { AuthShell } from "~/features/drawer/components/AuthShell";
import { ui } from "~/features/drawer/components/ui";
import { z } from "zod";

import { AUTH_MESSAGES, loginErrorMessage, resendErrorMessage } from "~/features/auth/auth-messages";
import { readRememberedEmail, withRememberedEmail } from "~/features/auth/remember-email.server";
import { demoLoginHeaders, hasDemoSession } from "~/features/demo/demo-auth.server";
import { getEnv } from "~/lib/env.server";
import { createSupabase } from "~/lib/supabase.server";
import type { Route } from "./+types/login";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

const resendSchema = z.object({ email: z.email() });

type LoginResult = { error: string | null; notice: string | null; unconfirmedEmail: string | null };
const result = (fields: Partial<LoginResult>): LoginResult => ({ error: null, notice: null, unconfirmedEmail: null, ...fields });

/** Sends the sign-up confirmation mail again. Says the same thing whether or not the address exists. */
async function resendConfirmation(request: Request, form: FormData) {
  const parsed = resendSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return data(result({ error: AUTH_MESSAGES.resendFailed }), { status: 400 });
  const env = getEnv();
  if (env.isDemo) return data(result({ notice: AUTH_MESSAGES.resent }));

  const { supabase, headers } = createSupabase(request);
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${env.APP_URL}/login` },
  });
  if (error) {
    console.error("resend failed", error.code ?? error.status);
    return data(result({ error: resendErrorMessage(error.code), unconfirmedEmail: parsed.data.email }), { status: 400, headers });
  }
  return data(result({ notice: AUTH_MESSAGES.resent }), { headers });
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "로그인" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const isDeleted = new URL(request.url).searchParams.get("deleted") === "1";
  const rememberedEmail = await readRememberedEmail(request);
  if (getEnv().isDemo) {
    if (hasDemoSession(request)) throw redirect("/drawer");
    return data({ isDemo: true, isDeleted, rememberedEmail });
  }
  const { supabase, headers } = createSupabase(request);
  const { data: auth } = await supabase.auth.getClaims();
  if (auth?.claims.sub) {
    throw redirect("/drawer", { headers });
  }
  return data({ isDemo: false, isDeleted, rememberedEmail }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  if (form.get("intent") === "resend") return resendConfirmation(request, form);
  const parsed = credentialsSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) {
    return data(result({ error: AUTH_MESSAGES.loginFailed }), { status: 400 });
  }
  const env = getEnv();
  // Only touched after a successful sign-in; never the password.
  const rememberEmail = (headers: Headers) =>
    withRememberedEmail(
      headers,
      form.get("rememberEmail") === "on" ? parsed.data.email : null,
      env.APP_URL.startsWith("https://"),
    );

  // Demo mode: any well-formed email and password signs in to the sample data.
  if (env.isDemo) throw redirect("/drawer", { headers: await rememberEmail(demoLoginHeaders()) });

  const { supabase, headers } = createSupabase(request);
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Supabase error codes only; never log the submitted credentials.
    console.error("login failed", error.code ?? error.status);
    const { error: message, needsConfirmation } = loginErrorMessage(error.code);
    return data(result({ error: message, unconfirmedEmail: needsConfirmation ? parsed.data.email : null }), { status: 400, headers });
  }
  throw redirect("/drawer", { headers: await rememberEmail(headers) });
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  // formData stays set through the redirect's loading phase, so the button stays disabled until the next page.
  const isSubmitting = useNavigation().formData != null;

  return (
    <AuthShell>
      <Form method="post" className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold tracking-title">로그인</h1>
        {loaderData?.isDeleted && (
          <p role="status" className="rounded-md border border-ok/40 bg-ok-soft px-3 py-2 text-sm text-ink">
            탈퇴했어요. 모든 기록을 지웠어요.
          </p>
        )}
        {loaderData?.isDemo && (
          <p className="rounded-md bg-brass-soft px-3 py-2 text-sm text-ink">
            데모 모드: 아무 이메일과 비밀번호로 로그인할 수 있어요.
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className={ui.label}>이메일</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={loaderData?.rememberedEmail ?? undefined}
            required
            className={`${ui.input} py-2.5`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={ui.label}>비밀번호</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={`${ui.input} py-2.5`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            name="rememberEmail"
            type="checkbox"
            defaultChecked={loaderData?.rememberedEmail != null}
            className="size-4 accent-[var(--brass)]"
          />
          이메일 저장
        </label>
        {actionData?.error && (
          <p role="alert" className="text-sm text-danger">
            {actionData.error}
          </p>
        )}
        {actionData?.notice && (
          <p role="status" className="rounded-md border border-ok/40 bg-ok-soft px-3 py-2 text-sm text-ink">
            {actionData.notice}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`${ui.primary} py-2.5`}
        >
          {isSubmitting ? "로그인 중…" : "로그인"}
        </button>
        {actionData?.unconfirmedEmail && (
          <button
            type="submit"
            name="intent"
            value="resend"
            formNoValidate
            disabled={isSubmitting}
            className={`${ui.secondary} py-2.5`}
          >
            인증 메일 다시 보내기
          </button>
        )}
        <p className="text-center text-sm text-muted">
          처음이신가요?{" "}
          <Link to="/signup" className="font-semibold text-brass underline">
            가입하기
          </Link>
        </p>
      </Form>
    </AuthShell>
  );
}
