import { expect, type Page, test } from "@playwright/test";

// Demo mode (no E2E account in .env): in-memory data, fake LLM, and the bot simulator in
// place of Telegram. Walks milestones 1 and 2 in the browser.
const FAKE_GENERALIZED = "대형 금융사 결제 승인 API의 응답 지연 원인을 찾아 캐시를 적용함";

test.skip(Boolean(process.env.E2E_USER_EMAIL), "runs only in demo mode");

// The dev server hydrates late; interacting before that can lose input state.
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
}

async function signInFresh(page: Page) {
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
  await settled(page);
}

function shelf(page: Page, name: string) {
  return page.getByTestId("shelf").filter({ has: page.getByText(`📇 ${name}`, { exact: true }) });
}

async function sendToBot(page: Page, text: string) {
  await page.getByLabel("메시지").fill(text);
  await page.getByRole("button", { name: "보내기" }).click();
  await settled(page);
}

async function pressBot(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).last().click();
  await settled(page);
}

/** Answers question 1 and skips 2 and 3, which leaves the confirmation card. */
async function answerOneQuestion(page: Page, text: string) {
  await expect(page.getByTestId("bot-message").last()).toContainText("1/3 오늘 무엇을 했나요?");
  await sendToBot(page, text);
  await expect(page.getByTestId("bot-message").last()).toContainText("2/3");
  await pressBot(page, "건너뛰기");
  await expect(page.getByTestId("bot-message").last()).toContainText("3/3");
  await pressBot(page, "아직 몰라요");
}

test("demo: link the bot, shelve a new book, find a log by tag, then edit and delete it", async ({ page }) => {
  await signInFresh(page);

  // Seeded bookshelf: a newly shelved book plus two named shelves.
  await expect(shelf(page, "새로 꽂힌 책").getByTestId("book")).toHaveCount(1);
  await expect(shelf(page, "A사").getByTestId("book")).toHaveCount(2);
  await expect(shelf(page, "개인 프로젝트").getByTestId("book")).toHaveCount(1);

  // M1: a first-time user links the simulator bot straight from the bookshelf's setup card.
  const setup = page.getByTestId("telegram-setup");
  await expect(setup).toContainText("1. 텔레그램 연결");
  await setup.getByRole("checkbox", { name: "동의합니다" }).check();
  await setup.getByRole("button", { name: "텔레그램 연결하기" }).click();
  await page.getByTestId("deep-link").click();
  await expect(page).toHaveURL(/\/drawer\/demo-bot\?start=/);
  await settled(page);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByTestId("bot-message").last()).toContainText("연결됐어요");

  // A book created from the bot becomes current; the answer card carries tags.
  await sendToBot(page, "/project 오픈소스 기여");
  await expect(page.getByTestId("bot-message").last()).toContainText("프로젝트를 만들었어요: 오픈소스 기여");

  // Outside a recording session, chat goes nowhere near the AI.
  await sendToBot(page, "오늘 점심 뭐 먹지");
  await expect(page.getByTestId("bot-message").last()).toContainText("지금은 기록 시간이 아니에요");

  await pressBot(page, "지금 기록하기");
  await answerOneQuestion(page, "A은행 결제승인 API 응답이 느려서 레디스 캐시 붙임");
  const card = page.getByTestId("bot-message").last();
  await expect(card).toContainText("[오픈소스 기여]");
  await expect(card).toContainText("태그: #Redis #캐시 #성능 개선");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByTestId("bot-message").last()).toContainText("서랍에 넣었어요");

  // M2: the new book sits on the "newly shelved" shelf; make a shelf and move it there.
  await page.goto("/drawer");
  await settled(page);
  await expect(shelf(page, "새로 꽂힌 책").getByTestId("book")).toHaveCount(2);
  await page.getByLabel("새 칸 이름").fill("오픈소스");
  await page.getByRole("button", { name: "칸 만들기" }).click();
  await expect(page.getByRole("status")).toContainText("'오픈소스' 칸을 만들었어요");

  await page.getByRole("link", { name: "오픈소스 기여 열기" }).click();
  await expect(page).toHaveURL(/\/drawer\/books\//);
  await settled(page);
  await expect(page.getByText("● 진행 중")).toBeVisible();
  await page.getByText("책 관리").click();
  await page.getByLabel("칸으로 이동").selectOption({ label: "오픈소스" });
  await page.getByRole("button", { name: "칸으로 이동" }).click();
  await expect(page.getByRole("status")).toContainText("칸을 옮겼어요");

  await page.getByRole("link", { name: "← 책장" }).click();
  await settled(page);
  await expect(shelf(page, "오픈소스").getByTestId("book")).toHaveCount(1);
  await expect(shelf(page, "새로 꽂힌 책").getByTestId("book")).toHaveCount(1);

  // Find the log by tag, across books, and jump to it.
  await page.getByLabel("태그 필터").selectOption("Redis");
  await page.getByRole("button", { name: "찾기" }).click();
  await expect(page).toHaveURL(/tag=Redis/);
  await settled(page);
  await expect(page.getByTestId("search-summary")).toContainText("기록 2건 · 책 2권");
  await expect(page.getByText("A은행")).toHaveCount(0);
  await page
    .getByRole("article")
    .filter({ hasText: "오픈소스 기여" })
    .getByTestId("search-hit")
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/\/drawer\/books\/.+#log-/);
  await settled(page);

  // Fix the tags, then edit and delete the log on the book page.
  const log = page.getByTestId("log").filter({ hasText: FAKE_GENERALIZED });
  await log.getByText("수정·삭제").click();
  await log.getByLabel("태그 편집").fill("Redis, 대용량 트래픽");
  await log.getByRole("button", { name: "태그 저장" }).click();
  await expect(page.getByRole("status")).toContainText("태그를 고쳤어요");
  await expect(log.getByRole("link", { name: "#대용량 트래픽" })).toBeVisible();

  await log.getByText("수정·삭제").click();
  await log.getByLabel("기록 내용").fill("금융권 결제 API에 캐시 적용");
  await log.getByRole("button", { name: "고친 내용 저장" }).click();
  const edited = page.getByTestId("log").filter({ hasText: "금융권 결제 API에 캐시 적용" });
  await expect(edited).toContainText("직접 수정");

  await edited.getByText("수정·삭제").click();
  await edited.getByRole("button", { name: "삭제" }).click();
  await edited.getByRole("button", { name: "지우기" }).click();
  await expect(page.getByTestId("log")).toHaveCount(0);

  // Older logs without tags can be tagged in one click.
  await page.goto("/drawer");
  await settled(page);
  await page.getByRole("button", { name: /태그 채우기/ }).click();
  await expect(page.getByRole("status")).toContainText("기록 2개에 태그를 붙였어요");
  await expect(page.getByRole("button", { name: /태그 채우기/ })).toHaveCount(0);
});

test("demo: the hourly prompt is skipped once today is logged", async ({ page }) => {
  await signInFresh(page);
  await page.goto("/drawer/settings");
  await settled(page);
  await page.getByRole("checkbox", { name: "동의합니다" }).check();
  await page.getByRole("button", { name: "텔레그램 연결하기" }).click();
  await page.getByTestId("deep-link").click();
  await settled(page);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await settled(page);

  await page.getByRole("button", { name: /21:00 알림 시뮬레이션/ }).click();
  await expect(page.getByTestId("bot-message").last()).toContainText("오늘 한 일, 서랍에 넣어두세요");

  await answerOneQuestion(page, "오늘은 장애 회고 문서를 정리함");
  await pressBot(page, "저장");

  await page.getByRole("button", { name: /21:00 알림 시뮬레이션/ }).click();
  await expect(page.getByTestId("transcript")).toContainText("알림 대상이 아니에요");
});

test("demo: saving an interview draft lands on the bookshelf", async ({ page }) => {
  await signInFresh(page);
  await page.goto("/onboarding");
  await settled(page);
  await expect(page.getByRole("link", { name: "책장" })).toHaveAttribute("href", "/drawer");

  await page.getByLabel("답변").fill("A사에서 결제 시스템을 개편했어요");
  await page.getByRole("button", { name: "보내기" }).click();
  await page.getByRole("button", { name: "이 프로젝트 정리하기" }).click();
  await expect(page.getByRole("region", { name: "프로젝트 초안" })).toBeVisible();
  await page.getByLabel("프로젝트명").fill("인터뷰로 복원한 프로젝트");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page).toHaveURL(/\/drawer$/);
  await settled(page);
  await expect(shelf(page, "새로 꽂힌 책").getByRole("link", { name: "인터뷰로 복원한 프로젝트 열기" })).toBeVisible();
});

test("demo: a log written on the web lands in the book, also the first one of an empty book", async ({ page }) => {
  await signInFresh(page);
  await page.getByLabel("새 책 이름").fill("웹으로 쓰는 책");
  await page.getByRole("button", { name: "책 만들기" }).click();
  await settled(page);
  await page.getByRole("link", { name: "웹으로 쓰는 책 열기" }).click();
  await settled(page);
  await expect(page.getByText("아직 기록이 없어요")).toBeVisible();

  await page.getByText("✏️ 기록 직접 쓰기").click();
  await page.getByLabel("새 기록 내용").fill("정산 배치 재시도 정책을 정리했어요");
  await page.getByRole("button", { name: "기록 넣기" }).click();

  await expect(page.getByRole("status")).toContainText("기록을 넣었어요");
  await expect(page.getByTestId("log")).toHaveCount(1);
  await expect(page.getByTestId("log").first()).toContainText("정산 배치 재시도 정책을 정리했어요");
  await expect(page.getByLabel("새 기록 내용")).toHaveValue("");
});

test("demo: deleting the account signs out and wipes the data", async ({ page }) => {
  await signInFresh(page);
  await page.goto("/drawer/settings");
  await settled(page);
  await page.getByRole("button", { name: "회원 탈퇴" }).click();
  await page.getByRole("button", { name: "탈퇴하기" }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1$/);
  await expect(page.getByRole("status")).toContainText("탈퇴했어요");
  await page.goto("/drawer");
  await expect(page).toHaveURL(/\/login$/);
});

test("demo: ending a project turns its logs into a STAR summary with blanks and evidence", async ({ page }) => {
  await signInFresh(page);
  await page.getByRole("link", { name: "결제 시스템 개편 열기" }).click();
  await settled(page);

  const summary = page.getByRole("region", { name: "STAR 요약" });
  await summary.getByRole("button", { name: "프로젝트 끝내고 STAR 정리" }).click();

  await expect(page.getByRole("status")).toContainText("STAR를 정리했어요");
  await expect(summary.getByTestId("star-status")).toContainText("초안");
  await expect(summary.getByLabel("R · 결과")).toHaveValue(/\[빈칸: 개선 전후 응답 시간\]/);
  await expect(summary.getByText("빈칸: 개선 전후 응답 시간", { exact: true })).toBeVisible();
  await expect(summary.getByText("근거:").first()).toBeVisible();
  await expect(page.getByText("📘 완결")).toBeVisible();

  await summary.getByLabel("R · 결과").fill("응답 지연이 줄어 결제 실패가 감소했다.");
  await summary.getByRole("button", { name: "이대로 저장" }).click();

  await expect(page.getByRole("status")).toContainText("STAR를 저장했어요");
  await expect(summary.getByTestId("star-status")).toContainText("저장됨");
  await expect(summary.getByLabel("R · 결과")).toHaveValue("응답 지연이 줄어 결제 실패가 감소했다.");
});
