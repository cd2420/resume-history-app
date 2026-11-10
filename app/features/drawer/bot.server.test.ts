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
let now = NOW;

beforeEach(() => {
  repo = new FakeDrawerRepo();
  telegram = createFakeTelegram();
  const fake = createFakeDrawerLlm();
  llmCreate = vi.fn(fake.responses.create);
  now = NOW;
  deps = { repo, telegram, llm: { responses: { create: llmCreate } }, now: () => now, appUrl: APP_URL };
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

/** Presses the button labelled `label` on the most recent message that has it. */
async function pressLabel(from: number, label: string) {
  const message = [...telegram.sent].reverse().find((m) => m.keyboard?.flat().some((b) => b.text === label));
  const button = message?.keyboard?.flat().find((b) => b.text === label);
  if (!message || !button) throw new Error(`no button ${label}`);
  await handleUpdate(deps, press(from, button.callback_data, message.messageId));
}

/** /record -> answer question 1 -> skip 2 and 3 -> the card. */
async function sendAnswer(from = TG_A) {
  await handleUpdate(deps, text(from, "/record"));
  await handleUpdate(deps, text(from, RAW));
  await pressLabel(from, "건너뛰기");
  await pressLabel(from, "아직 몰라요");
  return repo.pendings.at(-1)!;
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

  test("a Telegram account that left another account today cannot join a new one", async () => {
    linkUser(USER_A, TG_A);
    repo.removeLink(USER_A); // unlink or account deletion
    const forB = createLinkToken();
    repo.tokens.set(forB.tokenHash, { userId: USER_B, used: false, expired: false });

    await handleUpdate(deps, text(TG_A, `/start ${forB.token}`));

    expect(lastText()).toBe(MESSAGES.telegramCooldown);
    expect(repo.links).toHaveLength(0);

    // The same account may relink: its daily usage is still counted.
    const forA = createLinkToken();
    repo.tokens.set(forA.tokenHash, { userId: USER_A, used: false, expired: false });
    await handleUpdate(deps, text(TG_A, `/start ${forA.token}`));
    expect(lastText()).toBe(MESSAGES.linked(APP_URL));
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
    await handleUpdate(deps, text(TG_A, "/record"));
    expect(lastText()).toBe(MESSAGES.noProject);
    expect(repo.sessions).toHaveLength(0);

    await handleUpdate(deps, text(TG_A, "/project 결제 시스템 개편"));
    expect(lastText()).toBe(MESSAGES.projectCreated("결제 시스템 개편"));
    expect(telegram.sent.at(-1)?.keyboard?.flat().map((b) => b.text)).toEqual(["지금 기록하기"]);
    expect((await repo.getCurrentProject(USER_A))?.title).toBe("결제 시스템 개편");
  });

  test("no project: a plain message becomes the first book and question 1 follows, without the model", async () => {
    await handleUpdate(deps, text(TG_A, "/record"));
    expect(lastText()).toBe(MESSAGES.noProject);

    await handleUpdate(deps, text(TG_A, "결제 시스템 개편"));

    expect((await repo.getCurrentProject(USER_A))?.title).toBe("결제 시스템 개편");
    const texts = telegram.sent.map((m) => m.text);
    expect(texts).toContain(MESSAGES.firstProjectCreated("결제 시스템 개편"));
    expect(lastText()).toBe(MESSAGES.sessionUser("결제 시스템 개편"));
    expect(repo.sessions[0]).toMatchObject({ status: "open", step: 1, source: "user" });
    expect(llmCreate).not.toHaveBeenCalled();
  });

  test("no project: an over-long first book name is refused", async () => {
    await handleUpdate(deps, text(TG_A, "가".repeat(201)));

    expect(lastText()).toBe(MESSAGES.projectTitleInvalid);
    expect(await repo.listProjects(USER_A)).toHaveLength(0);
    expect(repo.sessions).toHaveLength(0);
  });

  test("ended books are left out of /project, and a user whose book ended starts a new one by name", async () => {
    const ended = withProject(USER_A, "결제 시스템 개편");
    repo.addProject(USER_A, "정산 배치");
    // Generating a STAR ends the book and clears it as the current one.
    repo.ended.add(ended.id);
    repo.currentProject.delete(USER_A);

    await handleUpdate(deps, text(TG_A, "/project"));
    expect(telegram.sent.at(-1)?.keyboard?.flat().map((b) => b.text)).toEqual(["정산 배치"]);

    await handleUpdate(deps, text(TG_A, "/record"));
    expect(lastText()).toBe(MESSAGES.noProject);
    expect(repo.sessions).toHaveLength(0);

    await handleUpdate(deps, text(TG_A, "주문 시스템 개편"));
    expect((await repo.getCurrentProject(USER_A))?.title).toBe("주문 시스템 개편");
    expect(lastText()).toBe(MESSAGES.sessionUser("주문 시스템 개편"));
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
    await handleUpdate(deps, text(TG_A, "/record"));

    await handleUpdate(deps, text(TG_A, "가".repeat(301)));

    expect(lastText()).toBe(MESSAGES.answerTooLong);
    expect(llmCreate).not.toHaveBeenCalled();
    expect(repo.sessions[0].step).toBe(1);
  });

  test("a model failure tells the user to retry and stores nothing", async () => {
    withProject(USER_A);
    await handleUpdate(deps, text(TG_A, "/record"));
    llmCreate.mockResolvedValueOnce(fakeResponse("", { refusal: "no" }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleUpdate(deps, text(TG_A, RAW));

    expect(lastText()).toBe(MESSAGES.generalizeFailed);
    expect(repo.pendings).toHaveLength(0);
    expect(repo.sessions[0]).toMatchObject({ step: 1, task: null, aiCalls: 1 });
    expect(JSON.stringify(error.mock.calls)).not.toContain(RAW);
    error.mockRestore();
  });

  test("a message from a user who had blocked the bot clears the block", async () => {
    repo.links[0].blocked = true;

    await handleUpdate(deps, text(TG_A, "/help"));

    expect(repo.links[0].blocked).toBe(false);
    expect(lastText()).toBe(MESSAGES.help(APP_URL));
  });

  test("the card shows tags and the saved log keeps them, also after a rewrite", async () => {
    withProject(USER_A);
    const first = await sendAnswer();
    expect(lastText()).toContain("태그: #Redis #캐시 #성능 개선");
    await handleUpdate(deps, press(TG_A, callbackData({ kind: "save", pendingId: first.id })));

    const second = await sendAnswer();
    await handleUpdate(deps, press(TG_A, callbackData({ kind: "edit", pendingId: second.id })));
    await handleUpdate(deps, text(TG_A, "고친 글"));

    expect(repo.logs.map((log) => log.tags)).toEqual([FAKE_GENERALIZATION.tags, FAKE_GENERALIZATION.tags]);
  });

  test("passes the user's existing tags to the model, not another user's", async () => {
    withProject(USER_A);
    repo.logs.push({ userId: USER_A, projectId: "p", logDate: "2026-11-01", content: "x", edited: false, tags: ["Kafka"] });
    repo.logs.push({ userId: USER_B, projectId: "q", logDate: "2026-11-01", content: "y", edited: false, tags: ["비밀태그"] });

    await sendAnswer();

    const instructions = llmCreate.mock.calls[0][0].instructions as string;
    expect(instructions).toContain("사용자가 이미 쓰는 태그: Kafka");
    expect(instructions).not.toContain("비밀태그");
  });
});

describe("recording sessions", () => {
  beforeEach(() => {
    linkUser(USER_A, TG_A);
    withProject(USER_A);
  });

  test("messages outside a session never reach the model or the database", async () => {
    await handleUpdate(deps, text(TG_A, "오늘 점심 뭐 먹지"));

    expect(lastText()).toBe(MESSAGES.outsideSession);
    expect(telegram.sent.at(-1)?.keyboard?.flat().map((b) => b.text)).toEqual(["지금 기록하기"]);
    expect(llmCreate).not.toHaveBeenCalled();
    expect(repo.pendings).toHaveLength(0);
    expect(repo.sessions).toHaveLength(0);
  });

  test("the [지금 기록하기] button opens a session and asks question 1", async () => {
    await handleUpdate(deps, text(TG_A, "아무 말"));
    await pressLabel(TG_A, "지금 기록하기");

    expect(lastText()).toBe(MESSAGES.sessionUser("결제 시스템 개편"));
    expect(repo.sessions[0]).toMatchObject({ status: "open", step: 1, source: "user", kstDate: "2026-11-10" });
    // 2026-11-10 23:30 KST -> the session closes at 2026-11-11 00:00 KST
    expect(repo.sessions[0].expiresAt.toISOString()).toBe("2026-11-10T15:00:00.000Z");
  });

  test("three answers become one card; each answer is generalized once", async () => {
    await handleUpdate(deps, text(TG_A, "/record"));
    await handleUpdate(deps, text(TG_A, RAW));
    expect(lastText()).toContain("2/3");
    await handleUpdate(deps, text(TG_A, "캐시 도입을 제안했어요"));
    expect(lastText()).toContain("3/3");
    await handleUpdate(deps, text(TG_A, "응답 시간이 절반으로"));

    const g = FAKE_GENERALIZATION.generalized;
    expect(repo.pendings[0].generalized).toBe(`${g}\n· 내 역할·이유: ${g}\n· 결과: ${g}`);
    expect(llmCreate).toHaveBeenCalledTimes(3);
    expect(repo.sessions[0]).toMatchObject({ status: "carded", aiCalls: 3 });
    expect(lastText()).toContain("📝 이렇게 서랍에 넣을까요?");
    expect(JSON.stringify(repo.sessions)).not.toContain(RAW);
  });

  test("skipping optional questions leaves them out of the log", async () => {
    const pending = await sendAnswer();

    expect(pending.generalized).toBe(FAKE_GENERALIZATION.generalized);
    expect(llmCreate).toHaveBeenCalledTimes(1);
    expect(telegram.sent.some((m) => m.method === "editMessageText" && m.text?.includes(MESSAGES.skipped))).toBe(true);
  });

  test("question 1 cannot be skipped and a stale skip button does nothing", async () => {
    await handleUpdate(deps, text(TG_A, "/record"));
    const sessionId = repo.sessions[0].id;
    await handleUpdate(deps, press(TG_A, callbackData({ kind: "skip", sessionId })));
    expect(repo.sessions[0].step).toBe(1);

    await handleUpdate(deps, text(TG_A, RAW));
    await pressLabel(TG_A, "건너뛰기");
    await handleUpdate(deps, press(TG_A, callbackData({ kind: "skip", sessionId }))); // pressed again
    expect(repo.sessions[0].step).toBe(3);
  });

  test("/record during an open session resumes at the current question", async () => {
    await handleUpdate(deps, text(TG_A, "/record"));
    await handleUpdate(deps, text(TG_A, RAW));
    await handleUpdate(deps, text(TG_A, "/record"));

    expect(lastText()).toBe(`${MESSAGES.sessionResume}\n\n2/3 그중 직접 맡거나 결정한 건 뭐고, 왜 그렇게 했나요?\n예) 캐시 도입을 제안했어요. DB 조회가 병목이라서요`);
    expect(repo.sessions).toHaveLength(1);
  });

  test("a session closes at KST midnight", async () => {
    await handleUpdate(deps, text(TG_A, "/record"));
    now = new Date("2026-11-10T15:10:00Z"); // 00:10 KST the next day

    await handleUpdate(deps, text(TG_A, RAW));

    expect(lastText()).toBe(MESSAGES.outsideSession);
    expect(llmCreate).not.toHaveBeenCalled();
  });

  test("opening a session the next day marks yesterday's open one as expired", async () => {
    await handleUpdate(deps, text(TG_A, "/record"));
    now = new Date("2026-11-11T01:00:00Z"); // 10:00 KST the next day
    vi.useFakeTimers({ now, toFake: ["Date"] });

    await handleUpdate(deps, text(TG_A, "/record"));

    expect(repo.sessions.map((s) => [s.kstDate, s.status])).toEqual([
      ["2026-11-10", "expired"],
      ["2026-11-11", "open"],
    ]);
    vi.useRealTimers();
  });

  test("at most three sessions a day", async () => {
    for (let i = 0; i < 3; i++) {
      const pending = await sendAnswer();
      await handleUpdate(deps, press(TG_A, callbackData({ kind: "cancel", pendingId: pending.id })));
    }
    await handleUpdate(deps, text(TG_A, "/record"));

    expect(lastText()).toBe(MESSAGES.dailyLimit);
    expect(repo.sessions).toHaveLength(3);
  });

  test("a session stops calling the model after five attempts", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    llmCreate.mockResolvedValue(fakeResponse("not json"));
    await handleUpdate(deps, text(TG_A, "/record"));

    for (let i = 0; i < 6; i++) await handleUpdate(deps, text(TG_A, RAW));

    expect(llmCreate).toHaveBeenCalledTimes(5);
    expect(lastText()).toBe(MESSAGES.aiLimit);
    expect(repo.sessions[0].status).toBe("cancelled");
    error.mockRestore();
  });
});


describe("bot membership", () => {
  function membership(from: number, status: string, chatType = "private"): TelegramUpdate {
    return {
      update_id: updateId++,
      my_chat_member: { from: { id: from }, chat: { id: from, type: chatType }, new_chat_member: { status } },
    };
  }

  test("marks the link blocked when the user blocks the bot", async () => {
    linkUser(USER_A, TG_A);
    await handleUpdate(deps, membership(TG_A, "kicked"));
    expect(repo.links[0].blocked).toBe(true);
    expect(telegram.sent).toHaveLength(0);
  });

  test("clears the block when the user restarts the bot", async () => {
    linkUser(USER_A, TG_A);
    repo.links[0].blocked = true;
    await handleUpdate(deps, membership(TG_A, "member"));
    expect(repo.links[0].blocked).toBe(false);
  });

  test("ignores unlinked users and non-private chats", async () => {
    linkUser(USER_A, TG_A);
    await handleUpdate(deps, membership(TG_B, "kicked"));
    await handleUpdate(deps, membership(TG_A, "kicked", "group"));
    expect(repo.links[0].blocked).toBe(false);
    expect(telegram.sent).toHaveLength(0);
  });
});

describe("switching project mid-session", () => {
  test("says the open session still goes to its original book", async () => {
    linkUser(USER_A, TG_A);
    withProject(USER_A, "결제 시스템 개편");
    const other = repo.addProject(USER_A, "정산 배치");
    await handleUpdate(deps, text(TG_A, "/record"));
    await handleUpdate(deps, text(TG_A, RAW));

    await handleUpdate(deps, press(TG_A, callbackData({ kind: "current", projectId: other.id })));

    expect(lastText()).toBe(MESSAGES.currentProjectSetMidSession("정산 배치", "결제 시스템 개편"));
    expect(repo.sessions[0].projectId).not.toBe(other.id);
  });

  test("keeps the plain confirmation when no session is open", async () => {
    linkUser(USER_A, TG_A);
    withProject(USER_A);
    const other = repo.addProject(USER_A, "정산 배치");

    await handleUpdate(deps, press(TG_A, callbackData({ kind: "current", projectId: other.id })));

    expect(lastText()).toBe(MESSAGES.currentProjectSet("정산 배치"));
  });
});
