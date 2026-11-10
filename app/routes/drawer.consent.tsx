import { data, Form, redirect, useNavigation } from "react-router";

import { CONSENT_VERSION } from "~/features/drawer/drawer-web.server";
import { requireDrawerSession } from "~/features/drawer/session.server";
import type { Route } from "./+types/drawer.consent";

export function meta({}: Route.MetaArgs) {
  return [{ title: "동의 · 이력서랍" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { store, headers } = await requireDrawerSession(request);
  if (await store.hasRequiredConsents()) throw redirect("/drawer", { headers });
  return data({ version: CONSENT_VERSION }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const { store, headers } = await requireDrawerSession(request);
  const form = await request.formData();
  // The overseas transfer consent is a separate, required checkbox.
  if (form.get("privacy") !== "on" || form.get("overseas_transfer") !== "on") {
    return data({ error: "두 항목에 모두 동의해야 이용할 수 있어요." }, { status: 400, headers });
  }
  if (!(await store.hasRequiredConsents())) {
    await store.recordConsents();
  }
  throw redirect("/drawer", { headers });
}

export default function Consent({ loaderData, actionData }: Route.ComponentProps) {
  // formData stays set through the redirect's loading phase, so the button stays disabled until the next page.
  const isSubmitting = useNavigation().formData != null;

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-8 text-slate-50">
      <Form method="post" className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <h1 className="text-2xl font-bold">시작하기 전에</h1>

        <section className="flex flex-col gap-2 rounded bg-slate-800 p-4 text-sm leading-relaxed">
          <h2 className="font-semibold">[필수] 개인정보 수집·이용</h2>
          <ul className="list-disc pl-5 text-slate-300">
            <li>항목: 이메일, 텔레그램 사용자 ID, 프로젝트 이름, 저장한 일일 기록(기밀을 가린 글 또는 직접 고친 글)</li>
            <li>목적: 회고 알림 발송, 경력 기록 보관과 조회</li>
            <li>보관: 탈퇴하거나 직접 삭제할 때까지</li>
            <li>텔레그램으로 보낸 답변 원문은 이력서랍 저장소에 저장하지 않아요.</li>
          </ul>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="privacy" required className="h-4 w-4" />
            <span>동의합니다</span>
          </label>
        </section>

        <section className="flex flex-col gap-2 rounded bg-slate-800 p-4 text-sm leading-relaxed">
          <h2 className="font-semibold">[필수] 개인정보 국외 이전</h2>
          <ul className="list-disc pl-5 text-slate-300">
            <li>이전받는 자: OpenAI (미국)</li>
            <li>이전 항목: 텔레그램으로 보낸 답변 원문</li>
            <li>목적: 고객사명·내부 시스템명·절대 수치 같은 기밀을 가리는 처리</li>
            <li>시기·방법: 답변을 보낼 때마다 암호화된 네트워크로 전송</li>
            <li>보관: OpenAI의 남용 모니터링 목적으로 최대 30일. 응답 저장 기능은 끈 상태로 요청해요.</li>
            <li>동의하지 않으면 텔레그램 기록 기능을 쓸 수 없어요.</li>
          </ul>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="overseas_transfer" required className="h-4 w-4" />
            <span>동의합니다</span>
          </label>
        </section>

        {actionData?.error && (
          <p role="alert" className="text-sm text-red-400">
            {actionData.error}
          </p>
        )}
        <button type="submit" disabled={isSubmitting} className="rounded bg-sky-600 py-2 font-semibold disabled:opacity-50">
          {isSubmitting ? "저장 중…" : "동의하고 계속"}
        </button>
        <p className="text-center text-xs text-slate-500">동의 버전 {loaderData.version}</p>
      </Form>
    </main>
  );
}
