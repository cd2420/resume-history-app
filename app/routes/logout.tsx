import { redirect } from "react-router";

import { demoLogoutHeaders } from "~/features/demo/demo-auth.server";
import { getEnv } from "~/lib/env.server";
import { createSupabase } from "~/lib/supabase.server";
import type { Route } from "./+types/logout";

export async function action({ request }: Route.ActionArgs) {
  if (getEnv().isDemo) throw redirect("/login", { headers: demoLogoutHeaders() });
  const { supabase, headers } = createSupabase(request);
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("logout failed", error.code ?? error.status);
  }
  throw redirect("/login", { headers });
}

export function loader() {
  throw redirect("/");
}
