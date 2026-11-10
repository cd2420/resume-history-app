import { beforeEach, describe, expect, type Mock, test, vi } from "vitest";

import { createFakeTelegram } from "~/features/telegram/fake-telegram";
import type { TelegramUpdate } from "~/features/telegram/update-schema";
import { type BotDeps, handleUpdate, MESSAGES } from "./bot.server";
import { createFakeDrawerLlm, FAKE_GENERALIZATION, fakeResponse } from "./fake-llm";
import { FakeDrawerRepo } from "./fake-repo";
import type { DrawerLlmClient } from "./generalize.server";
import { callbackData } from "./ids";
import { createLinkToken } from "./link-token.server";

const APP_URL = "https://drawer.example.com";
const USER_A = "00000000-0000-4000-8000-0000000000aa";
const USER_B = "00000000-0000-4000-8000-0000000000bb";
const TG_A = 111;
const TG_B = 222;
// 2026-11-10 23:30 KST
const NOW = new Date("2026-11-10T14:30:00Z");
const RAW = "A은행 결제승인 API 응답이 느려서 레디스 캐시 붙임";

let repo: FakeDrawerRepo;
let telegram: ReturnType<typeof createFakeTelegram>;
let llmCreate: Mock<DrawerLlmClient["responses"]["create"]>;
let deps: BotDeps;
let updateId = 1;

beforeEach(() => {
  repo = new FakeDrawerRepo();
  telegram = createFakeTelegram();
  const fake = createFakeDrawerLlm();
  llmCreate = vi.fn(fake.responses.create);
  deps = { repo, telegram, llm: { responses: { create: llmCreate } }, now: () => NOW, appUrl: APP_URL };
});

function text(from: number, value: string): TelegramUpdate {
  return {
    update_id: updateId++,
    message: { message_id: updateId, from: { id: from }, chat: { id: from, type: "private" }, text: value },
  };
}

function press(from: number, data: string, messageId = 1000): TelegramUpdate {
  return {
    update_id: updateId++,
    callback_query: { id: `cb${updateId}`, from: { id: from }, data, message: { message_id: messageId, chat: { id: from, type: "private" } } },
  };
}

function lastText() {
  return telegram.sent.filter((m) => m.method !== "answerCallbackQuery").at(-1)?.text;
}

function linkUser(userId: string, telegramUserId: number) {
  repo.links.push({ userId, telegramUserId, chatId: telegramUserId, blocked: false });
}

function withProject(userId: string, title = "결제 시스템 개편") {
  const project = repo.addProject(userId, title);
  repo.currentProject.set(userId, project.id);
  return project;
}

async function sendAnswer(from = TG_A) {
  await handleUpdate(deps, text(from, RAW));
  const pending = repo.pendings.at(-1)!;
  return pending;
}

describe("linking", () => {
  test("unlinked user gets the web link guide", async () => {
    await handleUpdate(deps, text(TG_A, "안녕"));

    expect(lastText()).toBe(MESSAGES.notLinked(APP_URL));
    expect(llmCreate).not.toHaveBeenCalled();
  });

  test("/start with a valid token links the account", async () => {
    const { token, tokenHash } = createLinkToken();
    repo.tokens.set(tokenHash, { userId: USER_A, used: false, expired: false });

    await handleUpdate(deps, text(TG_A, `/start ${token}`));

    expect(lastText()).toBe(MESSAGES.linked(APP_URL));
    expect(await repo.findLinkByTelegramUser(TG_A)).toEqual({ userId: USER_A, chatId: TG_A, blocked: false });
  });

  test("expired, reused or malformed tokens are refused", async () => {
    const expired = createLinkToken();
    repo.tokens.set(expired.tokenHash, { userId: USER_A, used: false, expired: true });
    const used = createLinkToken();
    repo.tokens.set(used.tokenHash, { userId: USER_A, used: true, expired: false });

    for (const token of [expired.token, used.token, "not-a-token", createLinkToken().token]) {
      await handleUpdate(deps, text(TG_A, `/start ${token}`));
      expect(lastText()).toBe(MESSAGES.linkInvalid(APP_URL));
    }
    expect(repo.links).toHaveLength(0);
  });

  test("a Telegram account already linked to someone else is refused", async () => {
    linkUser(USER_A, TG_A);
    const { token, tokenHash } = createLinkToken();
    repo.tokens.set(tokenHash, { userId: USER_B, used: false, expired: false });

    await handleUpdate(deps, text(TG_A, `/start ${token}`));

    expect(lastText()).toBe(MESSAGES.telegramTaken);
    expect((await repo.findLinkByTelegramUser(TG_A))?.userId).toBe(USER_A);
  });

  test("ignores group chats and bots", async () => {
    linkUser(USER_A, TG_A);
    await handleUpdate(deps, { update_id: 99, message: { message_id: 1, from: { id: TG_A }, chat: { id: -5, type: "group" }, text: RAW } });
    await handleUpdate(deps, { update_id: 98, message: { message_id: 1, from: { id: TG_A, is_bot: true }, chat: { id: TG_A, type: "private" }, text: RAW } });

    expect(telegram.sent).toHaveLength(0);
  });
});

describe("daily answer", () => {
  beforeEach(() => linkUser(USER_A, TG_A));

  test("answer -> card -> save stores the generalized text, never the raw answer", async () => {
    withProject(USER_A);

    const pending = await sendAnswer();
    expect(lastText()).toContain(FAKE_GENERALIZATION.generalized);
    expect(lastText()).toContain("가린 정보: 고객사명");
    expect(pending.cardMessageId).not.toBeNull();

    await handleUpdate(deps, press(TG_A, callbackData({ kind: "save", pendingId: pending.id })));

    expect(repo.logs).toMatchObject([
      { userId: USER_A, projectId: pending.projectId, logDate: "2026-11-10", content: FAKE_GENERALIZATION.generalized, edited: false },
    ]);
    expect(repo.pendings).toHaveLength(0);
    expect(JSON.stringify(repo)).not.toContain(RAW);
    expect(telegram.sent.some((m) => m.method === "answerCallbackQuery")).toBe(true);
  });

  test("pressing save twice stores one log", async () => {
    withProject(USER_A);
    const pending = await sendAnswer();
    const data = callbackData({ kind: "save", pendingId: pending.id });

    await handleUpdate(deps, press(TG_A, data));
    await handleUpdate(deps, press(TG_A, data));

    expect(repo.logs).toHaveLength(1);
    expect(lastText()).toBe(MESSAGES.expired);
  });

  test("edit -> rewritten text is saved verbatim with edited=true and no second LLM call", async () => {
    withProject(USER_A);
    const pending = await sendAnswer();

    await handleUpdate(deps, press(TG_A, callbackData({ kind: "edit", pendingId: pending.id })));
    expect(lastText()).toContain(MESSAGES.editPrompt);

    await handleUpdate(deps, text(TG_A, "금융권 결제 API에 캐시 적용해 응답 개선"));

    expect(repo.logs).toMatchObject([
      { userId: USER_A, projectId: pending.projectId, logDate: "2026-11-10", content: "금융권 결제 API에 캐시 적용해 응답 개선", edited: true },
    ]);
    expect(llmCreate).toHaveBeenCalledTimes(1);
  });

  test("cancel stores nothing", async () => {
    withProject(USER_A);
    const pending = await sendAnswer();

    await handleUpdate(deps, press(TG_A, callbackData({ kind: "cancel", pendingId: pending.id })));

    expect(repo.logs).toHaveLength(0);
    expect(repo.pendings).toHaveLength(0);
    expect(lastText()).toBe(MESSAGES.cancelled);
  });

  test("move -> pick saves into the chosen project", async () => {
    withProject(USER_A, "결제 시스템 개편");
    const other = repo.addProject(USER_A, "정산 배치");
    const pending = await sendAnswer();

    await handleUpdate(deps, press(TG_A, callbackData({ kind: "move", pendingId: pending.id })));
    const pickKeyboard = telegram.sent.at(-2)?.keyboard;
    expect(pickKeyboard?.flat().map((b) => b.text)).toEqual(["✓ 결제 시스템 개편", "정산 배치", "← 돌아가기"]);

    await handleUpdate(deps, press(TG_A, callbackData({ kind: "pick", pendingId: pending.id, projectId: other.id })));
    expect(lastText()).toContain("[정산 배치]");
    await handleUpdate(deps, press(TG_A, callbackData({ kind: "save", pendingId: pending.id })));

    expect(repo.logs[0].projectId).toBe(other.id);
  });

  test("no current project -> guide; /project name creates and selects it", async () => {
    await handleUpdate(deps, text(TG_A, RAW));
    expect(lastText()).toBe(MESSAGES.noProject);
    expect(llmCreate).not.toHaveBeenCalled();

    await handleUpdate(deps, text(TG_A, "/project 결제 시스템 개편"));
    expect(lastText()).toBe(MESSAGES.projectCreated("결제 시스템 개편"));
    expect((await repo.getCurrentProject(USER_A))?.title).toBe("결제 시스템 개편");
  });

  test("/project lists projects and a button switches the current one", async () => {
    withProject(USER_A, "결제 시스템 개편");
    const other = repo.addProject(USER_A, "정산 배치");

    await handleUpdate(deps, text(TG_A, "/project"));
    expect(telegram.sent.at(-1)?.keyboard?.flat().map((b) => b.text)).toEqual(["✓ 결제 시스템 개편", "정산 배치"]);

    await handleUpdate(deps, press(TG_A, callbackData({ kind: "current", projectId: other.id })));
    expect((await repo.getCurrentProject(USER_A))?.id).toBe(other.id);
  });

  test("another user's card or project cannot be touched", async () => {
    withProject(USER_A);
    const pending = await sendAnswer();
    linkUser(USER_B, TG_B);
    const bProject = withProject(USER_B, "B 프로젝트");

    await handleUpdate(deps, press(TG_B, callbackData({ kind: "save", pendingId: pending.id })));
    await handleUpdate(deps, press(TG_A, callbackData({ kind: "pick", pendingId: pending.id, projectId: bProject.id })));
    await handleUpdate(deps, press(TG_A, callbackData({ kind: "current", projectId: bProject.id })));

    expect(repo.logs).toHaveLength(0);
    expect(repo.pendings[0].projectId).toBe(pending.projectId);
    expect((await repo.getCurrentProject(USER_A))?.id).toBe(pending.projectId);
  });

  test("over-long answers are refused without calling the model", async () => {
    withProject(USER_A);

    await handleUpdate(deps, text(TG_A, "가".repeat(1001)));

    expect(lastText()).toBe(MESSAGES.tooLong);
    expect(llmCreate).not.toHaveBeenCalled();
  });

  test("a model failure tells the user to retry and stores nothing", async () => {
    withProject(USER_A);
    llmCreate.mockResolvedValueOnce(fakeResponse("", { refusal: "no" }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleUpdate(deps, text(TG_A, RAW));

    expect(lastText()).toBe(MESSAGES.generalizeFailed);
    expect(repo.pendings).toHaveLength(0);
    expect(JSON.stringify(error.mock.calls)).not.toContain(RAW);
    error.mockRestore();
  });

  test("a message from a user who had blocked the bot clears the block", async () => {
    repo.links[0].blocked = true;

    await handleUpdate(deps, text(TG_A, "/help"));

    expect(repo.links[0].blocked).toBe(false);
    expect(lastText()).toBe(MESSAGES.help(APP_URL));
  });
});
