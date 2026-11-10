import { updateSchema } from "~/features/telegram/update-schema";
import { type BotDeps, handleUpdate } from "./bot.server";
import { secretsMatch } from "./link-token.server";
import { type NotifyDeps, runHourlyNotify } from "./notify.server";

const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";
const CRON_SECRET_HEADER = "x-cron-secret";

const ok = () => new Response(null, { status: 200 });

function errorTag(error: unknown) {
  if (error && typeof error === "object") {
    const e = error as { name?: string; reason?: string; status?: number; code?: string };
    return [e.name, e.reason ?? e.status ?? e.code].filter(Boolean).join(":");
  }
  return "unknown";
}

/**
 * Telegram webhook. Always answers 200 once the secret matches, so Telegram does not retry
 * an update we already saw or one that failed for a reason a retry would not fix.
 * Never logs the update body: it carries the user's raw answer.
 */
export async function processTelegramWebhook(
  request: Request,
  secret: string,
  getDeps: () => BotDeps,
): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!secretsMatch(request.headers.get(TELEGRAM_SECRET_HEADER), secret)) {
    return new Response(null, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ok();
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return ok();

  const deps = getDeps();
  try {
    if (!(await deps.repo.recordUpdate(parsed.data.update_id))) return ok();
    await handleUpdate(deps, parsed.data);
  } catch (error) {
    console.error("telegram update failed", errorTag(error));
  }
  return ok();
}

/** Hourly call from Supabase pg_cron. */
export async function processCronNotify(
  request: Request,
  secret: string,
  getDeps: () => NotifyDeps,
): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!secretsMatch(request.headers.get(CRON_SECRET_HEADER), secret)) {
    return new Response(null, { status: 401 });
  }
  try {
    const result = await runHourlyNotify(getDeps());
    return Response.json(result);
  } catch (error) {
    console.error("hourly notify failed", errorTag(error));
    return Response.json({ error: "notify failed" }, { status: 500 });
  }
}
