import { getBotDeps } from "~/features/drawer/deps.server";
import { processTelegramWebhook } from "~/features/drawer/endpoints.server";
import { getEnv } from "~/lib/env.server";
import type { Route } from "./+types/api.telegram.webhook";

// Resource route: Telegram posts every bot update here (see scripts/set-telegram-webhook.ts).
export async function action({ request }: Route.ActionArgs) {
  return processTelegramWebhook(request, getEnv().TELEGRAM_WEBHOOK_SECRET, getBotDeps);
}

export function loader() {
  return new Response(null, { status: 405 });
}
