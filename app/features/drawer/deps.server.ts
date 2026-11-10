import { appendFileSync } from "node:fs";

import { getDemoStore, resetDemoStore } from "~/features/demo/demo-store.server";
import { createFakeTelegram } from "~/features/telegram/fake-telegram";
import { createTelegramClient, type TelegramClient } from "~/features/telegram/telegram.server";
import { getEnv } from "~/lib/env.server";
import { getLlm } from "~/lib/llm.server";
import { getSupabaseAdmin } from "~/lib/supabase-admin.server";
import type { BotDeps } from "./bot.server";
import { createDrawerRepo, deleteAuthUser } from "./drawer.server";
import type { NotifyDeps } from "./notify.server";

let cachedTelegram: TelegramClient | undefined;

function getTelegram(): TelegramClient {
  if (!cachedTelegram) {
    const env = getEnv();
    const outbox = env.E2E_FAKE_TELEGRAM_OUTBOX;
    cachedTelegram = outbox
      ? createFakeTelegram((message) => appendFileSync(outbox, `${JSON.stringify(message)}\n`))
      : createTelegramClient(env.TELEGRAM_BOT_TOKEN);
  }
  return cachedTelegram;
}

export function getBotDeps(): BotDeps {
  if (getEnv().isDemo) {
    const store = getDemoStore();
    return { repo: store, telegram: store.telegram, llm: getLlm(), now: () => new Date(), appUrl: getEnv().APP_URL };
  }
  return {
    repo: createDrawerRepo(getSupabaseAdmin()),
    telegram: getTelegram(),
    llm: getLlm(),
    now: () => new Date(),
    appUrl: getEnv().APP_URL,
  };
}

export function getNotifyDeps(): NotifyDeps {
  if (getEnv().isDemo) {
    const store = getDemoStore();
    return { repo: store, telegram: store.telegram, now: () => new Date(), sleep: async () => {} };
  }
  return { repo: createDrawerRepo(getSupabaseAdmin()), telegram: getTelegram(), now: () => new Date() };
}

/** Deletes the user and all their data. Demo mode has one shared sample user, so it resets the sample data. */
export async function deleteAccount(userId: string): Promise<void> {
  if (getEnv().isDemo) {
    resetDemoStore();
    return;
  }
  await deleteAuthUser(getSupabaseAdmin(), userId);
}
