// Bot copy and card rendering, shared by the bot handler, recording sessions and notifier.
import type { InlineKeyboard } from "~/features/telegram/telegram.server";
import type { ChangeCategory } from "./generalize.server";
import { callbackData } from "./ids";
import { ANSWER_MAX_LENGTH, MAX_LOG_LENGTH, MAX_PROJECT_TITLE } from "./limits";
import type { Pending, ProjectSummary, SessionStep } from "./repo";

const CHANGE_LABELS: Record<ChangeCategory, string> = {
  client_name: "고객사명",
  internal_system: "내부 시스템명",
  absolute_number: "절대 수치",
  person_name: "사람 이름",
  other: "기타 고유 정보",
};

const SESSION_HINT = "질문 3개면 끝나요. 오늘 자정까지 답할 수 있어요.";

/** Free-tier notice shown before a round starts, so the cap is not a surprise. Admins never see it. */
export const LIMIT_HINT = "AI 정리는 하루 한 번이에요. 세 질문에 차분히 답해 주세요.";

/** Says which book the answers go to, and how to switch when the user moved to another project. */
function sessionHint(book: string, isLimited: boolean): string {
  const limit = isLimited ? `\n${LIMIT_HINT}` : "";
  return `${SESSION_HINT}${limit}\n📕 '${book}' 책에 넣을게요. 다른 프로젝트였다면 마지막 카드에서 [프로젝트 변경]을, 앞으로 계속 바꾸려면 /project 를 보내 주세요.`;
}

export const QUESTIONS: Record<SessionStep, string> = {
  1: "1/3 오늘 무엇을 했나요?\n예) 결제 API 응답이 느린 원인을 찾았어요",
  2: "2/3 그중 직접 맡거나 결정한 건 뭐고, 왜 그렇게 했나요?\n예) 캐시 도입을 제안했어요. DB 조회가 병목이라서요",
  3: "3/3 결과나 달라진 점은요? 숫자가 있으면 같이 적어 주세요.\n예) 응답 시간이 절반으로 줄었어요",
};

/** Label on the button that skips an optional question. Question 1 is required. */
export const SKIP_LABELS: Partial<Record<SessionStep, string>> = {
  2: "건너뛰기",
  3: "아직 몰라요",
};

export const MESSAGES = {
  notLinked: (appUrl: string) =>
    `먼저 웹에서 가입하고 텔레그램을 연결해 주세요.\n${appUrl}/drawer/settings`,
  /** `withButton`: the settings link travels as a Telegram login button instead of a bare URL. */
  linked: (appUrl: string, withButton = false) =>
    `연결됐어요! 🗄️\n${withButton ? "알림 시간은 아래 [알림 시간 정하기]에서 정할 수 있어요." : `알림 시간은 웹에서 정할 수 있어요: ${appUrl}/drawer/settings`}\n\n` +
    "지금 어떤 프로젝트를 하고 있나요? 이름만 보내 주세요.\n예) 결제 시스템 개편",
  linkInvalid: (appUrl: string) =>
    `연결 링크가 만료됐거나 이미 쓰였어요. 웹에서 새 링크를 받아 주세요.\n${appUrl}/drawer/settings`,
  telegramTaken: "이 텔레그램 계정은 이미 다른 계정에 연결돼 있어요.",
  telegramCooldown: "이 텔레그램 계정은 오늘 다른 계정에서 연결을 해제했어요. 내일(한국 시간 자정 이후) 다시 연결해 주세요.",
  help: (appUrl: string, isLimited = true, withButton = false) =>
    "이력서랍 사용법\n" +
    "• 정해진 시간에 질문 3개가 와요. 답하면 기밀을 가린 카드가 오고, [저장]을 누르면 서랍에 들어가요.\n" +
    (isLimited ? "• 무료 이용 한도: AI 기록 정리 하루 1회, STAR 정리 하루 1회(책마다 1회)\n" : "") +
    "• /record — 지금 기록하기\n" +
    "• /project — 현재 프로젝트 바꾸기\n" +
    "• /project 이름 — 새 프로젝트를 만들고 현재 프로젝트로 지정\n" +
    `• 책장에서 기록 찾기·수정: ${withButton ? "아래 [책장 열기]" : `${appUrl}/drawer`}`,
  noProject:
    "지금 기록을 넣을 책이 없어요. 이전 책은 끝났거나 아직 만들지 않았어요.\n" +
    "새로 하는 프로젝트 이름만 보내 주세요.\n예) 결제 시스템 개편\n" +
    "진행 중인 다른 책이 있다면 /project 로 고를 수 있어요.",
  firstProjectCreated: (title: string) =>
    `📕 '${title}' 책을 만들었어요. 이름은 웹 책장에서 바꿀 수 있어요.\n` +
    "다른 프로젝트를 하게 되면 /project 새이름 으로 만들고, /project 로 바꿀 수 있어요.",
  projectTitleInvalid: `프로젝트 이름은 1~${MAX_PROJECT_TITLE}자로 보내 주세요.`,
  projectCreated: (title: string) => `프로젝트를 만들었어요: ${title}\n오늘 한 일을 남기려면 아래 버튼을 눌러 주세요.`,
  projectList: "현재 프로젝트를 골라 주세요.\n새 프로젝트는 /project 이름 으로 만들 수 있어요.",
  currentProjectSet: (title: string) => `현재 프로젝트: ${title}`,
  currentProjectSetMidSession: (title: string, sessionBook: string) =>
    `현재 프로젝트: ${title}\n지금 답하고 있는 기록은 '${sessionBook}' 책에 들어가요. 마지막 카드에서 [프로젝트 변경]으로 옮길 수 있어요. '${title}'은 다음 기록부터 적용돼요.`,
  tooLong: `${MAX_LOG_LENGTH}자 이내로 보내 주세요.`,
  answerTooLong: `${ANSWER_MAX_LENGTH}자 이내로 줄여서 보내 주세요.`,
  generalizeFailed: "지금은 정리하지 못했어요. 잠시 뒤 다시 보내 주세요.",
  editPrompt:
    "고친 내용을 보내 주세요. 보낸 글은 그대로 저장돼요.\n" +
    "⚠️ 고객사명·내부 시스템명·절대 수치는 빼고 써 주세요.",
  saved: (project: string, content: string) => `서랍에 넣었어요 ✅ [${project}]\n\n${content}`,
  cancelled: "취소했어요. 아무것도 저장하지 않았어요.",
  expired: "만료된 카드예요. 다시 보내 주세요.",
  pickProject: "어느 프로젝트에 넣을까요?",
  sessionNotify: (book: string, isLimited = true) =>
    `오늘 한 일, 서랍에 넣어두세요 🗄️\n${sessionHint(book, isLimited)}\n\n${QUESTIONS[1]}`,
  sessionUser: (book: string, isLimited = true) => `기록을 시작할게요 🗄️\n${sessionHint(book, isLimited)}\n\n${QUESTIONS[1]}`,
  sessionResume: "진행 중인 기록이 있어요. 이어서 답해 주세요.",
  outsideSession: "지금은 기록 시간이 아니에요.\n오늘 한 일을 남기려면 아래 버튼을 눌러 주세요.",
  dailyLimit:
    "오늘 기록은 이미 남기셨어요. AI 정리는 하루 한 번이에요.\n더 남길 일이 있으면 웹 책장의 '기록 직접 쓰기'로 적어 주세요. 내일 다시 만나요 🗄️",
  /** Sent when the day's one round ends (saved or dropped). */
  dayDone: "오늘 기록은 여기까지예요. AI 정리는 하루 한 번이에요.\n더 남길 일이 있으면 웹 책장의 '기록 직접 쓰기'로 적어 주세요. 내일 정한 시간에 다시 물어볼게요 🗄️",
  aiLimit:
    "이번 답은 AI가 정리하지 못했어요. AI 정리는 하루 한 번이라 오늘은 다시 시작할 수 없어요.\n웹 책장의 '기록 직접 쓰기'로 남겨 주세요.",
  skipped: "→ 건너뛰었어요",
} as const;

const WEB_PAGES = {
  drawer: { label: "책장 열기", path: "" },
  settings: { label: "알림 시간 정하기", path: "/settings" },
} as const;

/**
 * A button that opens a web page signed in. It lands on /auth/telegram/..., which checks
 * Telegram's signature and redirects to /drawer/...; the path carries the page so the URL
 * has no query of its own (Telegram signs every query field it appends).
 */
export function webLoginKeyboard(appUrl: string, page: keyof typeof WEB_PAGES): InlineKeyboard {
  const { label, path } = WEB_PAGES[page];
  return [[{ text: label, login_url: { url: `${appUrl}/auth/telegram${path}` } }]];
}

export function recordButton(): InlineKeyboard {
  return [[{ text: "지금 기록하기", callback_data: callbackData({ kind: "record" }) }]];
}

export function questionKeyboard(step: SessionStep, sessionId: string): InlineKeyboard | undefined {
  const label = SKIP_LABELS[step];
  return label ? [[{ text: label, callback_data: callbackData({ kind: "skip", sessionId }) }]] : undefined;
}

export function renderCard(
  pending: Pick<Pending, "generalized" | "changes" | "tags">,
  project: ProjectSummary | null,
): string {
  const changed = pending.changes.length
    ? `가린 정보: ${pending.changes.map((c) => CHANGE_LABELS[c]).join(", ")}`
    : "가린 정보 없음";
  const tags = pending.tags.length ? `\n태그: ${pending.tags.map((t) => `#${t}`).join(" ")}` : "";
  return `📝 이렇게 서랍에 넣을까요?\n[${project?.title ?? "프로젝트 없음"}]\n\n${pending.generalized}\n\n${changed}${tags}`;
}

export function cardKeyboard(pendingId: string): InlineKeyboard {
  return [
    [
      { text: "저장", callback_data: callbackData({ kind: "save", pendingId }) },
      { text: "수정", callback_data: callbackData({ kind: "edit", pendingId }) },
      { text: "취소", callback_data: callbackData({ kind: "cancel", pendingId }) },
    ],
    [{ text: "프로젝트 변경", callback_data: callbackData({ kind: "move", pendingId }) }],
  ];
}
