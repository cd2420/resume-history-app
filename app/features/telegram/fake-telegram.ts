import type { InlineKeyboard, TelegramClient } from "./telegram.server";

export interface SentMessage {
  method: "sendMessage" | "editMessageText" | "answerCallbackQuery";
  chatId?: number;
  messageId?: number;
  callbackQueryId?: string;
  text?: string;
  keyboard?: InlineKeyboard;
}

/** Records every call instead of hitting the Bot API. `onSend` lets E2E persist them. */
export function createFakeTelegram(onSend?: (message: SentMessage) => void): TelegramClient & { sent: SentMessage[] } {
  const sent: SentMessage[] = [];
  let nextId = 1000;
  const record = (message: SentMessage) => {
    sent.push(message);
    onSend?.(message);
  };
  return {
    sent,
    async sendMessage(chatId, text, keyboard) {
      const messageId = nextId++;
      record({ method: "sendMessage", chatId, messageId, text, keyboard });
      return { messageId };
    },
    async editMessageText(chatId, messageId, text, keyboard) {
      record({ method: "editMessageText", chatId, messageId, text, keyboard });
    },
    async answerCallbackQuery(callbackQueryId, text) {
      record({ method: "answerCallbackQuery", callbackQueryId, text });
    },
  };
}
