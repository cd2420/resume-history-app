import { beforeEach, describe, expect, test, vi } from "vitest";

import { createFakeTelegram } from "~/features/telegram/fake-telegram";
import type { BotDeps } from "./bot.server";
import { processCronNotify, processTelegramWebhook } from "./endpoints.server";
import { createFakeDrawerLlm } from "./fake-llm";
import { FakeDrawerRepo } from "./fake-repo";

const SECRET = "webhook_secret_value_0123456789abcdef";
const CRON = "cron-secret-value-0123456789abcdef";
const RAW = "A은행 결제승인 API 응답 개선";

let repo: FakeDrawerRepo;
let telegram: ReturnType<typeof createFakeTelegram>;
let deps: BotDeps;

beforeEach(() => {
  repo = new FakeDrawerRepo();
  telegram = createFakeTelegram();
  deps = { repo, telegram, llm: createFakeDrawerLlm(), now: () => new Date("2026-11-10T12:00:00Z"), appUrl: "https://x" };
  repo.links.push({ userId: "u", telegramUserId: 7, chatId: 7, blocked: false });
  const project = repo.addProject("u", "P");
  repo.currentProject.set("u", project.id);
});

function webhook(body: unknown, secret: string | null = SECRET, method = "POST") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["X-Telegram-Bot-Api-Secret-Token"] = secret;
  return new Request("https://x/api/telegram/webhook", {
    method,
    headers,
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

const UPDATE = { update_id: 10, message: { message_id: 1, from: { id: 7 }, chat: { id: 7, type: "private" }, text: RAW } };

describe("processTelegramWebhook", () => {
  test("rejects a missing or wrong secret with 401 and does nothing", async () => {
    for (const secret of [null, "wrong", ""]) {
      const response = await processTelegramWebhook(webhook(UPDATE, secret), SECRET, () => deps);
      expect(response.status).toBe(401);
    }
    expect(repo.updates.size).toBe(0);
    expect(telegram.sent).toHaveLength(0);
  });

  test("rejects non-POST with 405", async () => {
    expect((await processTelegramWebhook(webhook(null, SECRET, "GET"), SECRET, () => deps)).status).toBe(405);
  });

  test("handles an update once even if Telegram delivers it twice", async () => {
    const first = await processTelegramWebhook(webhook(UPDATE), SECRET, () => deps);
    const second = await processTelegramWebhook(webhook(UPDATE), SECRET, () => deps);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(repo.pendings).toHaveLength(1);
    expect(telegram.sent.filter((m) => m.method === "sendMessage")).toHaveLength(1);
  });

  test("answers 200 to bodies it cannot use", async () => {
    for (const body of ["not json", { foo: 1 }]) {
      expect((await processTelegramWebhook(webhook(body), SECRET, () => deps)).status).toBe(200);
    }
    expect(telegram.sent).toHaveLength(0);
  });

  test("a handler failure is logged without the message text and still answers 200", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(repo, "getCurrentProject").mockRejectedValueOnce(Object.assign(new Error("db"), { name: "DrawerDbError", code: "XX000" }));

    const response = await processTelegramWebhook(webhook(UPDATE), SECRET, () => deps);

    expect(response.status).toBe(200);
    expect(error).toHaveBeenCalledWith("telegram update failed", "DrawerDbError:XX000");
    expect(JSON.stringify(error.mock.calls)).not.toContain(RAW);
    error.mockRestore();
  });
});

describe("processCronNotify", () => {
  const cron = (secret: string | null) =>
    new Request("https://x/api/cron/notify", {
      method: "POST",
      headers: secret === null ? {} : { "x-cron-secret": secret },
    });

  test("rejects a missing or wrong secret", async () => {
    for (const secret of [null, "nope"]) {
      expect((await processCronNotify(cron(secret), CRON, () => ({ ...deps, sleep: async () => {} }))).status).toBe(401);
    }
  });

  test("runs the hourly notify and returns counts", async () => {
    repo.notifyHour.set("u", 21);

    const response = await processCronNotify(cron(CRON), CRON, () => ({ ...deps, sleep: async () => {} }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ hour: 21, due: 1, sent: 1 });
  });
});
