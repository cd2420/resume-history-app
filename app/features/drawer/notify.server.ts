import { kstDate, kstHour } from "~/lib/kst";
import { TelegramError, type TelegramClient } from "~/features/telegram/telegram.server";
import { MESSAGES } from "./messages";
import { openRecording } from "./record.server";
import type { DrawerRepo } from "./repo";

export interface NotifyDeps {
  repo: DrawerRepo;
  telegram: TelegramClient;
  now: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface NotifyResult {
  hour: number;
  kstDate: string;
  due: number;
  sent: number;
  failed: number;
  blocked: number;
  skipped: number;
}

/** The hourly prompt: it opens a recording session and asks question 1. */
export const DAILY_QUESTION = MESSAGES.sessionNotify;

// Telegram FAQ: bulk sends above ~30 messages/second get 429. Stay well under.
const SEND_INTERVAL_MS = 40;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Asks every user whose chosen KST hour is now and who has not logged or been asked today.
 * The notification row is claimed before sending, so a duplicate cron call sends nothing.
 */
export async function runHourlyNotify({ repo, telegram, now, sleep = defaultSleep }: NotifyDeps): Promise<NotifyResult> {
  const at = now();
  const hour = kstHour(at);
  const date = kstDate(at);
  const due = await repo.listDueNotifications(hour, date);
  const result: NotifyResult = { hour, kstDate: date, due: due.length, sent: 0, failed: 0, blocked: 0, skipped: 0 };

  for (const [index, target] of due.entries()) {
    if (index > 0) await sleep(SEND_INTERVAL_MS);
    if (!(await repo.claimNotification(target.userId, date))) {
      result.skipped++;
      continue;
    }
    try {
      await openRecording({ repo, telegram, now: () => at }, target.userId, target.chatId, "notify");
      await repo.setNotificationStatus(target.userId, date, "sent");
      result.sent++;
    } catch (error) {
      if (error instanceof TelegramError && error.isBlocked) {
        await repo.markBlocked(target.userId);
        await repo.setNotificationStatus(target.userId, date, "blocked");
        result.blocked++;
      } else {
        console.error("daily question failed", error instanceof TelegramError ? error.status : "unknown");
        await repo.setNotificationStatus(target.userId, date, "failed");
        result.failed++;
      }
    }
  }
  return result;
}
