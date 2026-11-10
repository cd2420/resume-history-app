// Minimal Telegram Bot API client: https://core.telegram.org/bots/api
// Messages are plain text (no parse_mode) so user content never needs escaping.

export interface InlineButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboard = InlineButton[][];

export interface TelegramClient {
  sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<{ messageId: number }>;
  editMessageText(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard): Promise<void>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
}

export class TelegramError extends Error {
  constructor(
    readonly status: number,
    readonly description: string,
  ) {
    super(`telegram api error ${status}`);
    this.name = "TelegramError";
  }

  // 403: the user blocked the bot or deleted the chat.
  get isBlocked(): boolean {
    return this.status === 403;
  }
}

type FetchFn = typeof fetch;

interface ApiResponse {
  ok: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
}

const API_BASE = "https://api.telegram.org";

function markup(keyboard?: InlineKeyboard) {
  // An empty inline_keyboard removes the buttons when editing a message.
  return { reply_markup: { inline_keyboard: keyboard ?? [] } };
}

export function createTelegramClient(token: string, fetchFn: FetchFn = fetch): TelegramClient {
  async function call(method: string, body: Record<string, unknown>): Promise<unknown> {
    // The token is part of the URL: never log the URL or the thrown cause.
    const response = await fetchFn(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let json: ApiResponse;
    try {
      json = (await response.json()) as ApiResponse;
    } catch {
      throw new TelegramError(response.status, "invalid json");
    }
    if (!json.ok) {
      throw new TelegramError(json.error_code ?? response.status, json.description ?? "");
    }
    return json.result;
  }

  return {
    async sendMessage(chatId, text, keyboard) {
      const result = (await call("sendMessage", {
        chat_id: chatId,
        text,
        ...(keyboard ? markup(keyboard) : {}),
      })) as { message_id: number };
      return { messageId: result.message_id };
    },
    async editMessageText(chatId, messageId, text, keyboard) {
      try {
        await call("editMessageText", { chat_id: chatId, message_id: messageId, text, ...markup(keyboard) });
      } catch (error) {
        // Re-rendering an identical card is harmless.
        if (error instanceof TelegramError && error.description.includes("message is not modified")) return;
        throw error;
      }
    },
    async answerCallbackQuery(callbackQueryId, text) {
      await call("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
    },
  };
}
