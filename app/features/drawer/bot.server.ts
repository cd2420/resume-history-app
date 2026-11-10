import { kstDate } from "~/lib/kst";
import type { InlineKeyboard, TelegramClient } from "~/features/telegram/telegram.server";
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from "~/features/telegram/update-schema";
import {
  type ChangeCategory,
  type DrawerLlmClient,
  generalize,
  GeneralizeError,
} from "./generalize.server";
import { callbackData, parseCallbackData } from "./ids";
import { hashLinkToken, isLinkTokenShape } from "./link-token.server";
import { MAX_LOG_LENGTH, MAX_PROJECT_TITLE } from "./limits";
import type { DrawerRepo, Pending, ProjectSummary, TelegramLink } from "./repo";

export interface BotDeps {
  repo: DrawerRepo;
  telegram: TelegramClient;
  llm: DrawerLlmClient;
  now: () => Date;
  appUrl: string;
}

const PROJECT_LIST_LIMIT = 20;

const CHANGE_LABELS: Record<ChangeCategory, string> = {
  client_name: "고객사명",
  internal_system: "내부 시스템명",
  absolute_number: "절대 수치",
  person_name: "사람 이름",
  other: "기타 고유 정보",
};

export const MESSAGES = {
  notLinked: (appUrl: string) =>
    `먼저 웹에서 가입하고 텔레그램을 연결해 주세요.\n${appUrl}/drawer/settings`,
  linked: (appUrl: string) =>
    `연결됐어요! 🗄️\n알림 시간은 웹에서 정할 수 있어요: ${appUrl}/drawer/settings\n\n` +
    "먼저 지금 하고 있는 프로젝트를 만들어 주세요.\n예) /project 결제 시스템 개편",
  linkInvalid: (appUrl: string) =>
    `연결 링크가 만료됐거나 이미 쓰였어요. 웹에서 새 링크를 받아 주세요.\n${appUrl}/drawer/settings`,
  telegramTaken: "이 텔레그램 계정은 이미 다른 계정에 연결돼 있어요.",
  help: (appUrl: string) =>
    "이력서랍 사용법\n" +
    "• 오늘 한 일을 한두 줄로 보내면 기밀을 가린 카드가 와요. [저장]을 누르면 서랍에 들어가요.\n" +
    "• /project — 현재 프로젝트 바꾸기\n" +
    "• /project 이름 — 새 프로젝트를 만들고 현재 프로젝트로 지정\n" +
    `• 책장에서 기록 찾기·수정: ${appUrl}/drawer`,
  noProject: "먼저 프로젝트를 만들어 주세요.\n예) /project 결제 시스템 개편",
  projectTitleInvalid: `프로젝트 이름은 1~${MAX_PROJECT_TITLE}자로 보내 주세요.`,
  projectCreated: (title: string) => `프로젝트를 만들었어요: ${title}\n이제 오늘 한 일을 보내 주세요.`,
  projectList: "현재 프로젝트를 골라 주세요.\n새 프로젝트는 /project 이름 으로 만들 수 있어요.",
  currentProjectSet: (title: string) => `현재 프로젝트: ${title}`,
  tooLong: `${MAX_LOG_LENGTH}자 이내로 보내 주세요.`,
  generalizeFailed: "지금은 정리하지 못했어요. 잠시 뒤 다시 보내 주세요.",
  editPrompt:
    "고친 내용을 보내 주세요. 보낸 글은 그대로 저장돼요.\n" +
    "⚠️ 고객사명·내부 시스템명·절대 수치는 빼고 써 주세요.",
  saved: (project: string, content: string) => `서랍에 넣었어요 ✅ [${project}]\n\n${content}`,
  cancelled: "취소했어요. 아무것도 저장하지 않았어요.",
  expired: "만료된 카드예요. 다시 보내 주세요.",
  pickProject: "어느 프로젝트에 넣을까요?",
} as const;

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

function cardKeyboard(pendingId: string): InlineKeyboard {
  return [
    [
      { text: "저장", callback_data: callbackData({ kind: "save", pendingId }) },
      { text: "수정", callback_data: callbackData({ kind: "edit", pendingId }) },
      { text: "취소", callback_data: callbackData({ kind: "cancel", pendingId }) },
    ],
    [{ text: "프로젝트 변경", callback_data: callbackData({ kind: "move", pendingId }) }],
  ];
}

function projectButtonText(project: ProjectSummary, current: boolean) {
  const title = project.title.length > 40 ? `${project.title.slice(0, 39)}…` : project.title;
  return current ? `✓ ${title}` : title;
}

export async function handleUpdate(deps: BotDeps, update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallback(deps, update.callback_query);
    return;
  }
  const message = update.message;
  if (!message?.from || message.from.is_bot || message.chat.type !== "private") return;
  if (message.text === undefined) return;
  await handleMessage(deps, message, message.from.id, message.text.trim());
}

async function handleMessage(deps: BotDeps, message: TelegramMessage, telegramUserId: number, text: string) {
  const { repo, telegram, appUrl } = deps;
  const chatId = message.chat.id;
  const [command, ...args] = text.split(/\s+/);
  const argText = text.slice(command.length).trim();

  if (command === "/start" && args.length > 0) {
    const token = args[0];
    const result = isLinkTokenShape(token)
      ? await repo.linkTelegram(hashLinkToken(token), telegramUserId, chatId)
      : "invalid";
    const reply =
      result === "linked"
        ? MESSAGES.linked(appUrl)
        : result === "telegram_taken"
          ? MESSAGES.telegramTaken
          : MESSAGES.linkInvalid(appUrl);
    await telegram.sendMessage(chatId, reply);
    return;
  }

  const link = await repo.findLinkByTelegramUser(telegramUserId);
  if (!link) {
    await telegram.sendMessage(chatId, MESSAGES.notLinked(appUrl));
    return;
  }
  if (link.blocked) await repo.clearBlocked(link.userId);

  if (command === "/start" || command === "/help") {
    await telegram.sendMessage(chatId, MESSAGES.help(appUrl));
    return;
  }
  if (command === "/project") {
    await (argText ? createProject(deps, link, chatId, argText) : listProjects(deps, link, chatId));
    return;
  }
  if (command.startsWith("/")) {
    await telegram.sendMessage(chatId, MESSAGES.help(appUrl));
    return;
  }
  if (!text) return;
  if (text.length > MAX_LOG_LENGTH) {
    await telegram.sendMessage(chatId, MESSAGES.tooLong);
    return;
  }

  const editing = await repo.getEditingPending(link.userId);
  if (editing) {
    await saveRewrite(deps, link, editing, chatId, text);
    return;
  }
  await proposeCard(deps, link, chatId, text);
}

async function createProject(deps: BotDeps, link: TelegramLink, chatId: number, title: string) {
  if (title.length > MAX_PROJECT_TITLE) {
    await deps.telegram.sendMessage(chatId, MESSAGES.projectTitleInvalid);
    return;
  }
  const project = await deps.repo.createProject(link.userId, title);
  await deps.repo.setCurrentProject(link.userId, project.id);
  await deps.telegram.sendMessage(chatId, MESSAGES.projectCreated(project.title));
}

async function listProjects(deps: BotDeps, link: TelegramLink, chatId: number) {
  const [projects, current] = await Promise.all([
    deps.repo.listProjects(link.userId),
    deps.repo.getCurrentProject(link.userId),
  ]);
  if (projects.length === 0) {
    await deps.telegram.sendMessage(chatId, MESSAGES.noProject);
    return;
  }
  const keyboard = projects.slice(0, PROJECT_LIST_LIMIT).map((project) => [
    {
      text: projectButtonText(project, project.id === current?.id),
      callback_data: callbackData({ kind: "current", projectId: project.id }),
    },
  ]);
  await deps.telegram.sendMessage(chatId, MESSAGES.projectList, keyboard);
}

// The rewritten text is saved verbatim, without another generalization pass (user decision).
async function saveRewrite(deps: BotDeps, link: TelegramLink, pending: Pending, chatId: number, text: string) {
  const saved = await deps.repo.savePendingAsLog(link.userId, pending.id, text, true, kstDate(deps.now()));
  if (!saved) {
    await deps.telegram.sendMessage(chatId, MESSAGES.expired);
    return;
  }
  const project = await deps.repo.getProject(link.userId, pending.projectId);
  await deps.telegram.sendMessage(chatId, MESSAGES.saved(project?.title ?? "", text));
}

// `text` is the raw answer: it goes to the LLM once and is never stored or logged.
async function proposeCard(deps: BotDeps, link: TelegramLink, chatId: number, text: string) {
  const project = await deps.repo.getCurrentProject(link.userId);
  if (!project) {
    await deps.telegram.sendMessage(chatId, MESSAGES.noProject);
    return;
  }

  let result;
  try {
    result = await generalize(deps.llm, text, await deps.repo.listTags(link.userId));
  } catch (error) {
    if (!(error instanceof GeneralizeError)) throw error;
    console.error("generalize failed", error.reason);
    await deps.telegram.sendMessage(chatId, error.reason === "too_long" ? MESSAGES.tooLong : MESSAGES.generalizeFailed);
    return;
  }

  const pending = await deps.repo.createPending(link.userId, {
    projectId: project.id,
    generalized: result.generalized,
    changes: result.changes,
    tags: result.tags,
    chatId,
  });
  const sent = await deps.telegram.sendMessage(chatId, renderCard(pending, project), cardKeyboard(pending.id));
  await deps.repo.setCardMessage(link.userId, pending.id, sent.messageId);
}

async function handleCallback(deps: BotDeps, query: TelegramCallbackQuery) {
  const { repo, telegram, appUrl } = deps;
  let toast: string | undefined;
  try {
    const link = await repo.findLinkByTelegramUser(query.from.id);
    const action = query.data ? parseCallbackData(query.data) : null;
    const message = query.message;
    if (!link) {
      toast = "먼저 웹에서 연결해 주세요.";
      if (message) await telegram.sendMessage(message.chat.id, MESSAGES.notLinked(appUrl));
      return;
    }
    if (!action || !message) return;
    const chatId = message.chat.id;
    const messageId = message.message_id;

    if (action.kind === "current") {
      const ok = await repo.setCurrentProject(link.userId, action.projectId);
      const project = ok ? await repo.getProject(link.userId, action.projectId) : null;
      if (!project) {
        toast = "찾을 수 없는 프로젝트예요.";
        return;
      }
      toast = MESSAGES.currentProjectSet(project.title);
      await telegram.editMessageText(chatId, messageId, MESSAGES.currentProjectSet(project.title));
      return;
    }

    const pending = await repo.getPending(link.userId, action.pendingId);
    if (!pending) {
      toast = MESSAGES.expired;
      await telegram.editMessageText(chatId, messageId, MESSAGES.expired);
      return;
    }

    switch (action.kind) {
      case "save": {
        const saved = await repo.savePendingAsLog(link.userId, pending.id, pending.generalized, false, kstDate(deps.now()));
        if (!saved) {
          toast = MESSAGES.expired;
          await telegram.editMessageText(chatId, messageId, MESSAGES.expired);
          return;
        }
        const project = await repo.getProject(link.userId, pending.projectId);
        toast = "저장했어요";
        await telegram.editMessageText(chatId, messageId, MESSAGES.saved(project?.title ?? "", pending.generalized));
        return;
      }
      case "edit": {
        await repo.startEditing(link.userId, pending.id);
        const project = await repo.getProject(link.userId, pending.projectId);
        await telegram.editMessageText(chatId, messageId, `${renderCard(pending, project)}\n\n✏️ ${MESSAGES.editPrompt}`);
        return;
      }
      case "cancel": {
        await repo.deletePending(link.userId, pending.id);
        await telegram.editMessageText(chatId, messageId, MESSAGES.cancelled);
        return;
      }
      case "move": {
        const projects = await repo.listProjects(link.userId);
        const keyboard: InlineKeyboard = projects.slice(0, PROJECT_LIST_LIMIT).map((project) => [
          {
            text: projectButtonText(project, project.id === pending.projectId),
            callback_data: callbackData({ kind: "pick", pendingId: pending.id, projectId: project.id }),
          },
        ]);
        keyboard.push([{ text: "← 돌아가기", callback_data: callbackData({ kind: "back", pendingId: pending.id }) }]);
        await telegram.editMessageText(chatId, messageId, `${MESSAGES.pickProject}\n\n${pending.generalized}`, keyboard);
        return;
      }
      case "pick": {
        const moved = await repo.movePending(link.userId, pending.id, action.projectId);
        const project = await repo.getProject(link.userId, moved ? action.projectId : pending.projectId);
        if (!moved) toast = "찾을 수 없는 프로젝트예요.";
        const updated = { ...pending, projectId: moved ? action.projectId : pending.projectId };
        await telegram.editMessageText(chatId, messageId, renderCard(updated, project), cardKeyboard(pending.id));
        return;
      }
      case "back": {
        const project = await repo.getProject(link.userId, pending.projectId);
        await telegram.editMessageText(chatId, messageId, renderCard(pending, project), cardKeyboard(pending.id));
        return;
      }
    }
  } finally {
    // Telegram shows a spinner on the button until the query is answered.
    await telegram.answerCallbackQuery(query.id, toast).catch((error: unknown) => {
      console.error("answerCallbackQuery failed", error instanceof Error ? error.name : "unknown");
    });
  }
}
