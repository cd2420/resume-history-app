import { expect, type Page, test } from "@playwright/test";

// Demo mode (no E2E account in .env): in-memory data, fake LLM, and the bot simulator in
// place of Telegram. Walks the whole milestone 1 flow in the browser.
const FAKE_GENERALIZED = "대형 금융사 결제 승인 API의 응답 지연 원인을 찾아 캐시를 적용함";

test.skip(Boolean(process.env.E2E_USER_EMAIL), "runs only in demo mode");

// The dev server hydrates late; interacting before that can lose input state.
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
}

test("demo: sign in, link the simulator bot, save an answer, edit and delete it", async ({ page }) => {
  await page.goto("/login");
  await settled(page);
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await page.getByLabel("이메일").fill("demo@example.com");
  await page.getByLabel("비밀번호").fill("anything");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/drawer/);

  // Fresh store: reset so reruns against a reused server start clean.
  await page.goto("/drawer/demo-bot");
  await settled(page);
  await page.getByRole("button", { name: "데모 초기화" }).click();
  await settled(page);
  await page.goto("/drawer");
  await expect(page).toHaveURL(/\/drawer\/consent$/);
  await settled(page);
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "동의하고 계속" }).click();
  await expect(page).toHaveURL(/\/drawer$/);
  await expect(page.getByTestId("log")).toHaveCount(3);

  await page.getByRole("button", { name: "텔레그램 연결 링크 받기" }).click();
  await page.getByTestId("deep-link").click();
  await expect(page).toHaveURL(/\/drawer\/demo-bot\?start=/);
  await settled(page);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByTestId("bot-message").last()).toContainText("연결됐어요");
  await expect(page.getByTestId("demo-link-status")).toContainText("연결됨");

  await page.getByRole("button", { name: /21:00 알림 시뮬레이션/ }).click();
  await expect(page.getByTestId("bot-message").last()).toContainText("오늘 한 일, 서랍에 넣어두세요");

  await page.getByLabel("메시지").fill("A은행 결제승인 API 응답이 느려서 레디스 캐시 붙임");
  await page.getByRole("button", { name: "보내기" }).click();
  const card = page.getByTestId("bot-message").last();
  await expect(card).toContainText(FAKE_GENERALIZED);
  await expect(card).toContainText("[결제 시스템 개편]");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByTestId("bot-message").last()).toContainText("서랍에 넣었어요");

  // Logged today: the hourly job now skips this user.
  await page.getByRole("button", { name: /21:00 알림 시뮬레이션/ }).click();
  await expect(page.getByTestId("transcript")).toContainText("알림 대상이 아니에요");

  await page.goto("/drawer");
  await settled(page);
  const log = page.getByTestId("log").filter({ hasText: FAKE_GENERALIZED });
  await expect(log).toHaveCount(2); // one seeded sample + the one just saved
  await expect(page.getByText("A은행")).toHaveCount(0);

  const saved = log.first();
  await saved.getByText("수정·삭제").click();
  await saved.getByLabel("기록 내용").fill("금융권 결제 API에 캐시 적용");
  await saved.getByRole("button", { name: "고친 내용 저장" }).click();
  const edited = page.getByTestId("log").filter({ hasText: "금융권 결제 API에 캐시 적용" });
  await expect(edited).toContainText("직접 수정");

  page.once("dialog", (dialog) => dialog.accept());
  await edited.getByText("수정·삭제").click();
  await edited.getByRole("button", { name: "삭제" }).click();
  await expect(page.getByTestId("log").filter({ hasText: "금융권 결제 API에 캐시 적용" })).toHaveCount(0);
});
