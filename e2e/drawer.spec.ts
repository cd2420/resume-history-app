import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

import { TELEGRAM_OUTBOX } from "../playwright.config";

// Runs against the real Supabase project with a dedicated E2E account (never your own).
// LLM and Telegram are faked by the dev server, so this costs nothing and sends nothing.
const EMAIL = process.env.E2E_USER_EMAIL;
const PASSWORD = process.env.E2E_USER_PASSWORD;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
// Must match app/features/drawer/fake-llm.ts FAKE_GENERALIZATION.generalized.
const FAKE_GENERALIZED = "대형 금융사 결제 승인 API의 응답 지연 원인을 찾아 캐시를 적용함";

const telegramUserId = 900_000_000 + Math.floor(Math.random() * 99_999_999);
let updateId = Date.now();

interface OutboxMessage {
  method: string;
  chatId?: number;
  text?: string;
  keyboard?: { text: string; callback_data: string }[][];
}

function readOutbox(): OutboxMessage[] {
  if (!existsSync(TELEGRAM_OUTBOX)) return [];
  return readFileSync(TELEGRAM_OUTBOX, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutboxMessage);
}

async function postUpdate(request: APIRequestContext, update: Record<string, unknown>) {
  const response = await request.post("/api/telegram/webhook", {
    headers: { "X-Telegram-Bot-Api-Secret-Token": SECRET! },
    data: { update_id: updateId++, ...update },
  });
  expect(response.status()).toBe(200);
}

function sendText(request: APIRequestContext, text: string) {
  return postUpdate(request, {
    message: { message_id: updateId, from: { id: telegramUserId }, chat: { id: telegramUserId, type: "private" }, text },
  });
}

function pressButton(request: APIRequestContext, data: string) {
  return postUpdate(request, {
    callback_query: {
      id: `cb${updateId}`,
      from: { id: telegramUserId },
      data,
      message: { message_id: 1, chat: { id: telegramUserId, type: "private" } },
    },
  });
}

async function pressLabel(request: APIRequestContext, label: string) {
  const message = [...readOutbox()].reverse().find((m) => m.keyboard?.flat().some((b) => b.text === label));
  const button = message?.keyboard?.flat().find((b) => b.text === label);
  expect(button, `button ${label}`).toBeTruthy();
  await pressButton(request, button!.callback_data);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("이메일").fill(EMAIL!);
  await page.getByLabel("비밀번호").fill(PASSWORD!);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/drawer/);
  if (page.url().includes("/drawer/consent")) {
    await page.waitForLoadState("networkidle");
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: "동의하고 계속" }).click();
    await page.waitForURL(/\/drawer$/);
  }
}

const DEMO = !process.env.E2E_USER_EMAIL;

test("logged-out visitors are sent to /login", async ({ page }) => {
  await page.goto("/drawer");
  await expect(page).toHaveURL(/\/login$/);
});

test("webhook rejects requests without the secret", async ({ request }) => {
  test.skip(DEMO, "demo mode uses a placeholder secret");
  const response = await request.post("/api/telegram/webhook", { data: { update_id: 1 } });
  expect(response.status()).toBe(401);
});

test.describe("with the E2E account", () => {
  test.skip(!EMAIL || !PASSWORD || !SECRET, "E2E_USER_EMAIL, E2E_USER_PASSWORD and TELEGRAM_WEBHOOK_SECRET are required");

  test.beforeEach(() => {
    mkdirSync(dirname(TELEGRAM_OUTBOX), { recursive: true });
    rmSync(TELEGRAM_OUTBOX, { force: true });
  });

  test("link Telegram, save an answer, then find, edit and delete it on the web", async ({ page, request }) => {
    await login(page);
    await page.goto("/drawer/settings");
    await page.waitForLoadState("networkidle");

    // Leftover link from an earlier run.
    const unlink = page.getByRole("button", { name: "연결 해제" });
    if (await unlink.isVisible()) {
      await unlink.click();
      await expect(page.getByTestId("telegram-status")).toContainText("아직 연결하지 않았어요");
    }

    await page.getByRole("button", { name: "텔레그램 연결 링크 받기" }).click();
    const href = await page.getByTestId("deep-link").getAttribute("href");
    const token = new URL(href!).searchParams.get("start")!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await sendText(request, `/start ${token}`);
    expect(readOutbox().at(-1)?.text).toContain("연결됐어요");
    await page.reload();
    await expect(page.getByTestId("telegram-status")).toContainText("연결됨");

    // The same token cannot be reused.
    await sendText(request, `/start ${token}`);
    expect(readOutbox().at(-1)?.text).toContain("만료됐거나 이미 쓰였어요");

    // A book made from the bot becomes the current one.
    const projectTitle = `E2E 프로젝트 ${Date.now()}`;
    await sendText(request, `/project ${projectTitle}`);
    expect(readOutbox().at(-1)?.text).toContain(projectTitle);

    // Answers only count inside a recording session: open one, answer 1, skip 2 and 3.
    await sendText(request, "/record");
    expect(readOutbox().at(-1)?.text).toContain("1/3 오늘 무엇을 했나요?");
    await sendText(request, "A은행 결제승인 API 응답이 느려서 레디스 캐시 붙임");
    await pressLabel(request, "건너뛰기");
    await pressLabel(request, "아직 몰라요");
    const card = [...readOutbox()].reverse().find((m) => m.method === "sendMessage" && m.keyboard?.flat().some((b) => b.text === "저장"));
    expect(card?.text).toContain(FAKE_GENERALIZED);
    expect(card?.text).toContain(`[${projectTitle}]`);
    expect(card?.text).toContain("태그: #Redis");
    const save = card!.keyboard!.flat().find((button) => button.text === "저장")!;
    await pressButton(request, save.callback_data);

    // Already saved: a second press saves nothing more.
    await pressButton(request, save.callback_data);

    // The new book is on the "newly shelved" shelf; open it.
    await page.goto("/drawer");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: `${projectTitle} 열기` }).click();
    await expect(page).toHaveURL(/\/drawer\/books\//);
    await page.waitForLoadState("networkidle");
    const log = page.getByTestId("log").filter({ hasText: FAKE_GENERALIZED });
    await expect(log).toHaveCount(1);
    await expect(log.getByRole("link", { name: "#Redis" })).toBeVisible();
    await expect(page.getByText("A은행")).toHaveCount(0);

    await log.getByText("수정·삭제").click();
    await log.getByLabel("기록 내용").fill("금융권 결제 API에 캐시 적용");
    await log.getByRole("button", { name: "고친 내용 저장" }).click();
    const edited = page.getByTestId("log").filter({ hasText: "금융권 결제 API에 캐시 적용" });
    await expect(edited).toContainText("직접 수정");

    page.once("dialog", (dialog) => dialog.accept());
    await edited.getByText("수정·삭제").click();
    await edited.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByTestId("log")).toHaveCount(0);

    await page.goto("/drawer/settings");
    await page.getByRole("button", { name: "연결 해제" }).click();
    await expect(page.getByTestId("telegram-status")).toContainText("아직 연결하지 않았어요");
  });
});
