import { getNotifyDeps } from "~/features/drawer/deps.server";
import { processCronNotify } from "~/features/drawer/endpoints.server";
import { getEnv } from "~/lib/env.server";
import type { Route } from "./+types/api.cron.notify";

// Resource route: Supabase pg_cron calls this at minute 0 of every hour (UTC).
export async function action({ request }: Route.ActionArgs) {
  return processCronNotify(request, getEnv().CRON_SECRET, getNotifyDeps);
}

export function loader() {
  return new Response(null, { status: 405 });
}
