import { data, Form } from "react-router";

import { requireUser } from "~/lib/supabase.server";
import type { Route } from "./+types/onboarding";

export function meta({}: Route.MetaArgs) {
  return [{ title: "경력 인터뷰" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireUser(request);
  return data(null, { headers });
}

// ponytail: placeholder until Task 6 builds the interview chat UI.
export default function Onboarding() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 px-4 text-slate-50">
      <h1 className="text-2xl font-bold">경력 인터뷰</h1>
      <Form method="post" action="/logout">
        <button type="submit" className="text-sm text-slate-400 underline">
          로그아웃
        </button>
      </Form>
    </main>
  );
}
