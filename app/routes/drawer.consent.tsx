import { data, Form, redirect, useNavigation } from "react-router";

import { shownVersionsMatch, versionField } from "~/features/drawer/consent";
import { requireDrawerSession } from "~/features/drawer/session.server";
import type { Route } from "./+types/drawer.consent";

export function meta({}: Route.MetaArgs) {
  return [{ title: "동의 · 이력서랍" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { store, headers } = await requireDrawerSession(request);
  if (await store.hasRequiredConsents()) throw redirect("/drawer", { headers });
  return data({ terms: await store.getConsentTerms() }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const { store, headers } = await requireDrawerSession(request);
  const form = await request.formData();
  const terms = await store.getConsentTerms();
  // Each consent (including the overseas transfer) is a separate, required checkbox.
  if (terms.some((term) => form.get(term.kind) !== "on")) {
    return data({ error: "모든 필수 항목에 동의해야 이용할 수 있어요.", terms }, { status: 400, headers });
  }
  // Never record agreement to text the user did not see.
  if (!shownVersionsMatch(terms, form)) {
    return data({ error: "약관이 방금 바뀌었어요. 바뀐 내용을 확인하고 다시 동의해 주세요.", terms }, { status: 409, headers });
  }
  if (!(await store.hasRequiredConsents())) {
    await store.recordConsents(terms);
  }
  throw redirect("/drawer", { headers });
}

export default function Consent({ loaderData, actionData }: Route.ComponentProps) {
  // formData stays set through the redirect's loading phase, so the button stays disabled until the next page.
  const isSubmitting = useNavigation().formData != null;
  // After a 409 the action returns the new terms, so the page shows what will actually be recorded.
  const terms = actionData?.terms ?? loaderData.terms;

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-8 text-slate-50">
      <Form method="post" className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <h1 className="text-2xl font-bold">시작하기 전에</h1>

        {terms.map((term) => (
          <section key={term.kind} className="flex flex-col gap-2 rounded bg-slate-800 p-4 text-sm leading-relaxed">
            <h2 className="font-semibold">{term.title}</h2>
            <ul className="list-disc pl-5 text-slate-300">
              {term.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <input type="hidden" name={versionField(term.kind)} value={term.version} />
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" name={term.kind} required className="h-4 w-4" />
              <span>동의합니다</span>
            </label>
            <p className="text-xs text-slate-500">버전 {term.version}</p>
          </section>
        ))}

        {actionData?.error && (
          <p role="alert" className="text-sm text-red-400">
            {actionData.error}
          </p>
        )}
        <button type="submit" disabled={isSubmitting} className="rounded bg-sky-600 py-2 font-semibold disabled:opacity-50">
          {isSubmitting ? "저장 중…" : "동의하고 계속"}
        </button>
      </Form>
    </main>
  );
}
