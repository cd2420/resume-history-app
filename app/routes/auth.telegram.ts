// Landing page of the bot's login_url buttons: https://core.telegram.org/bots/api#loginurl
// Telegram appends the user's signed data; a valid signature from a linked Telegram account
// signs that account in, then the user lands on the page the button named. Anything else
// (declined, stale, unlinked) just goes to the page, which asks for login as usual.
import { redirect } from "react-router";

import { createDrawerRepo, createLoginTokenHash, DrawerDbError } from "~/features/drawer/drawer.server";
import { verifyTelegramLogin } from "~/features/telegram/telegram-login.server";
import { getEnv } from "~/lib/env.server";
import { getSupabaseAdmin } from "~/lib/supabase-admin.server";
import { createSupabase } from "~/lib/supabase.server";
import type { Route } from "./+types/auth.telegram";

// The path after /auth/telegram picks the page; nothing else is accepted (no open redirect).
const DESTINATIONS: Record<string, string> = {
  "": "/drawer",
  settings: "/drawer/settings",
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const destination = DESTINATIONS[params["*"] ?? ""] ?? "/drawer";
  const env = getEnv();
  if (env.isDemo) throw redirect(destination);

  const login = verifyTelegramLogin(new URL(request.url).searchParams, env.TELEGRAM_BOT_TOKEN, Date.now());
  if (!login) throw redirect(destination);

  // Bot rule: the account comes only from telegram_links.
  const admin = getSupabaseAdmin();
  const link = await createDrawerRepo(admin).findLinkByTelegramUser(login.telegramUserId);
  if (!link) throw redirect(destination);

  const { supabase, headers } = createSupabase(request);
  const { data: claims } = await supabase.auth.getClaims();
  const currentUserId = claims?.claims.sub;
  // Already in: keep the session. Someone else signed in on this browser: never switch accounts
  // from a link, so a forwarded link cannot swap whose drawer the browser writes to.
  if (currentUserId) throw redirect(destination, { headers });

  try {
    const tokenHash = await createLoginTokenHash(admin, link.userId);
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (error) {
      console.error("telegram login: verify failed", error.code ?? error.status);
      throw redirect("/login", { headers });
    }
  } catch (error) {
    if (!(error instanceof DrawerDbError)) throw error;
    console.error("telegram login: token failed", error.operation, error.code ?? "");
    throw redirect("/login", { headers });
  }
  throw redirect(destination, { headers });
}
