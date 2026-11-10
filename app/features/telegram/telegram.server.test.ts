import { describe, expect, test, vi } from "vitest";

import { createTelegramClient, TelegramError } from "./telegram.server";
import { updateSchema } from "./update-schema";

function fetchReturning(json: unknown, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status }));
}

describe("createTelegramClient", () => {
  test("posts JSON to the bot method and returns the message id", async () => {
    const fetchFn = fetchReturning({ ok: true, result: { message_id: 42 } });
    const client = createTelegramClient("123:abc", fetchFn);

    const result = await client.sendMessage(7, "안녕", [[{ text: "저장", callback_data: "s:x" }]]);

    expect(result).toEqual({ messageId: 42 });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(JSON.parse(init.body)).toEqual({
      chat_id: 7,
      text: "안녕",
      reply_markup: { inline_keyboard: [[{ text: "저장", callback_data: "s:x" }]] },
    });
  });

  test("editing without a keyboard removes the buttons", async () => {
    const fetchFn = fetchReturning({ ok: true, result: true });
    await createTelegramClient("t", fetchFn).editMessageText(7, 9, "끝");

    expect(JSON.parse(fetchFn.mock.calls[0][1].body).reply_markup).toEqual({ inline_keyboard: [] });
  });

  test("throws TelegramError and flags 403 as blocked", async () => {
    const fetchFn = fetchReturning({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }, 403);

    const thrown = await createTelegramClient("t", fetchFn).sendMessage(7, "hi").catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(TelegramError);
    expect((thrown as TelegramError).isBlocked).toBe(true);
    expect((thrown as Error).message).not.toContain("t/");
  });

  test("ignores 'message is not modified' on edit", async () => {
    const fetchFn = fetchReturning({ ok: false, error_code: 400, description: "Bad Request: message is not modified" }, 400);

    await expect(createTelegramClient("t", fetchFn).editMessageText(7, 9, "same")).resolves.toBeUndefined();
  });
});

describe("updateSchema", () => {
  test("parses a private text message and ignores unknown fields", () => {
    const parsed = updateSchema.parse({
      update_id: 1,
      message: { message_id: 3, from: { id: 5, is_bot: false, first_name: "x" }, chat: { id: 5, type: "private" }, date: 0, text: "hi" },
    });
    expect(parsed.message?.text).toBe("hi");
  });

  test("parses a callback query", () => {
    const parsed = updateSchema.parse({
      update_id: 2,
      callback_query: { id: "cb", from: { id: 5 }, data: "s:abc", message: { message_id: 3, chat: { id: 5, type: "private" } } },
    });
    expect(parsed.callback_query?.data).toBe("s:abc");
  });

  test("rejects an update without update_id", () => {
    expect(updateSchema.safeParse({ message: {} }).success).toBe(false);
  });
});
