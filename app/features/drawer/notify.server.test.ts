import { beforeEach, describe, expect, test, vi } from "vitest";

import { createFakeTelegram } from "~/features/telegram/fake-telegram";
import { TelegramError } from "~/features/telegram/telegram.server";
import { FakeDrawerRepo } from "./fake-repo";
import { MESSAGES } from "./messages";
import { runHourlyNotify } from "./notify.server";

const DAILY_QUESTION = MESSAGES.sessionNotify("책");

const A = "00000000-0000-4000-8000-0000000000aa";
const B = "00000000-0000-4000-8000-0000000000bb";
const C = "00000000-0000-4000-8000-0000000000cc";
// 2026-11-10 21:00 KST
const NOW = new Date("2026-11-10T12:00:00Z");

let repo: FakeDrawerRepo;
let telegram: ReturnType<typeof createFakeTelegram>;
const sleep = vi.fn(async () => {});

beforeEach(() => {
  repo = new FakeDrawerRepo();
  telegram = createFakeTelegram();
  sleep.mockClear();
  for (const [userId, tg] of [[A, 1], [B, 2], [C, 3]] as const) {
    repo.links.push({ userId, telegramUserId: tg, chatId: tg, blocked: false });
    repo.notifyHour.set(userId, 21);
    repo.currentProject.set(userId, repo.addProject(userId, "책").id);
  }
});

const run = () => runHourlyNotify({ repo, telegram, now: () => NOW, sleep });

describe("runHourlyNotify", () => {
  test("asks users whose KST hour is now", async () => {
    const result = await run();

    expect(result).toMatchObject({ hour: 21, kstDate: "2026-11-10", due: 3, sent: 3 });
    expect(telegram.sent.map((m) => [m.chatId, m.text])).toEqual([
      [1, DAILY_QUESTION],
      [2, DAILY_QUESTION],
      [3, DAILY_QUESTION],
    ]);
    expect(repo.notifications.get(`${A}:2026-11-10`)).toBe("sent");
  });

  test("skips users with another hour, a log today, or blocked", async () => {
    repo.notifyHour.set(A, 9);
    repo.logs.push({ userId: B, projectId: "p", logDate: "2026-11-10", content: "x", edited: false });
    repo.links[2].blocked = true;

    expect((await run()).due).toBe(0);
    expect(telegram.sent).toHaveLength(0);
  });

  test("a log from yesterday does not skip today", async () => {
    repo.logs.push({ userId: A, projectId: "p", logDate: "2026-11-09", content: "x", edited: false });

    expect((await run()).sent).toBe(3);
  });

  test("running twice in the same hour sends once", async () => {
    await run();
    const second = await run();

    expect(second.due).toBe(0);
    expect(telegram.sent).toHaveLength(3);
  });

  test("a concurrent run that loses the claim does not send", async () => {
    await repo.claimNotification(B, "2026-11-10");
    const due = vi.spyOn(repo, "listDueNotifications").mockResolvedValueOnce([
      { userId: A, chatId: 1 },
      { userId: B, chatId: 2 },
    ]);

    const result = await run();

    expect(result).toMatchObject({ sent: 1, skipped: 1 });
    due.mockRestore();
  });

  test("403 marks the user blocked; other errors are recorded as failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi
      .spyOn(telegram, "sendMessage")
      .mockRejectedValueOnce(new TelegramError(403, "Forbidden: bot was blocked by the user"))
      .mockRejectedValueOnce(new TelegramError(429, "Too Many Requests"));

    const result = await run();

    expect(result).toMatchObject({ blocked: 1, failed: 1, sent: 1 });
    expect(repo.links[0].blocked).toBe(true);
    expect(repo.notifications.get(`${A}:2026-11-10`)).toBe("blocked");
    expect(repo.notifications.get(`${B}:2026-11-10`)).toBe("failed");
    send.mockRestore();
    error.mockRestore();
  });

  test("spaces out sends", async () => {
    await run();

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(40);
  });
});

describe("hourly prompt sessions", () => {
  test("opens a recording session for each user it asks", async () => {
    await run();

    expect(repo.sessions.map((s) => [s.userId, s.source, s.step])).toEqual([
      [A, "notify", 1],
      [B, "notify", 1],
      [C, "notify", 1],
    ]);
  });

  test("skips a user who is in the middle of a session", async () => {
    await repo.openSession(A, {
      projectId: (await repo.getCurrentProject(A))!.id,
      chatId: 1,
      kstDate: "2026-11-10",
      source: "user",
      dailyLimit: 1,
      expiresAt: new Date("2026-11-10T15:00:00Z"),
    });

    expect((await run()).due).toBe(2);
  });

  test("a user without a book is asked for its name instead of question 1", async () => {
    repo.currentProject.delete(A);

    await run();

    expect(telegram.sent.find((m) => m.chatId === 1)?.text).toBe(MESSAGES.noProject);
  });
});

