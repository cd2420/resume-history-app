import { kstDate } from "~/lib/kst";
import type { InlineKeyboard, TelegramClient } from "~/features/telegram/telegram.server";
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from "~/features/telegram/update-schema";
import type { DrawerLlmClient } from "./generalize.server";
import { callbackData, parseCallbackData } from "./ids";
import { hashLinkToken, isLinkTokenShape } from "./link-token.server";
import { MAX_LOG_LENGTH, MAX_PROJECT_TITLE } from "./limits";
import { cardKeyboard, MESSAGES, QUESTIONS, recordButton, renderCard } from "./messages";
import { answerQuestion, openRecording, skipQuestion } from "./record.server";
import type { DrawerRepo, Pending, ProjectSummary, TelegramLink } from "./repo";

export { MESSAGES, renderCard };

export interface BotDeps {
  repo: DrawerRepo;
  telegram: TelegramClient;
  llm: DrawerLlmClient;
  now: () => Date;
  appUrl: string;
}

const PROJECT_LIST_LIMIT = 20;

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
  if (command === "/record") {
    await openRecording(deps, link.userId, chatId, "user");
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

  // Only answers inside a recording session reach the AI; anything else gets a pointer.
  const session = await repo.getOpenSession(link.userId, deps.now());
  if (session) {
    await answerQuestion(deps, session, text);
    return;
  }
  // A user without a book was asked for its name (MESSAGES.noProject): the reply becomes the
  // first book and recording starts right away. No AI is involved.
  if (!(await repo.getCurrentProject(link.userId))) {
    await startFirstProject(deps, link, chatId, text);
    return;
  }
  await telegram.sendMessage(chatId, MESSAGES.outsideSession, recordButton());
}

async function startFirstProject(deps: BotDeps, link: TelegramLink, chatId: number, title: string) {
  if (title.length > MAX_PROJECT_TITLE) {
    await deps.telegram.sendMessage(chatId, MESSAGES.projectTitleInvalid);
    return;
  }
  const project = await deps.repo.createProject(link.userId, title);
  await deps.repo.setCurrentProject(link.userId, project.id);
  await deps.telegram.sendMessage(chatId, MESSAGES.firstProjectCreated(project.title));
  // ponytail: recorded as source "user" even when the hourly prompt asked; track it if response-rate metrics need it.
  await openRecording(deps, link.userId, chatId, "user");
}

async function createProject(deps: BotDeps, link: TelegramLink, chatId: number, title: string) {
  if (title.length > MAX_PROJECT_TITLE) {
    await deps.telegram.sendMessage(chatId, MESSAGES.projectTitleInvalid);
    return;
  }
  const project = await deps.repo.createProject(link.userId, title);
  await deps.repo.setCurrentProject(link.userId, project.id);
  await deps.telegram.sendMessage(chatId, MESSAGES.projectCreated(project.title), recordButton());
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

    if (action.kind === "record") {
      await openRecording(deps, link.userId, chatId, "user");
      return;
    }

    if (action.kind === "skip") {
      const session = await repo.getOpenSession(link.userId, deps.now());
      if (!session || session.id !== action.sessionId || session.step === 1) {
        toast = "이미 지나간 질문이에요.";
        return;
      }
      await telegram.editMessageText(chatId, messageId, `${QUESTIONS[session.step]}\n\n${MESSAGES.skipped}`);
      await skipQuestion(deps, session);
      return;
    }

    if (action.kind === "current") {
      const ok = await repo.setCurrentProject(link.userId, action.projectId);
      const project = ok ? await repo.getProject(link.userId, action.projectId) : null;
      if (!project) {
        toast = "찾을 수 없는 프로젝트예요.";
        return;
      }
      toast = MESSAGES.currentProjectSet(project.title);
      // An open session keeps the book it opened with, so say where this answer still goes.
      const session = await repo.getOpenSession(link.userId, deps.now());
      const sessionBook =
        session && session.projectId !== project.id ? await repo.getProject(link.userId, session.projectId) : null;
      await telegram.editMessageText(
        chatId,
        messageId,
        sessionBook
          ? MESSAGES.currentProjectSetMidSession(project.title, sessionBook.title)
          : MESSAGES.currentProjectSet(project.title),
      );
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
