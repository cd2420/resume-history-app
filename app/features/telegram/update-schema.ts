import { z } from "zod";

// Only the Update fields the bot reads. Unknown fields are ignored.
const userSchema = z.object({ id: z.number().int(), is_bot: z.boolean().optional() });
const chatSchema = z.object({ id: z.number().int(), type: z.string() });

const messageSchema = z.object({
  message_id: z.number().int(),
  from: userSchema.optional(),
  chat: chatSchema,
  text: z.string().optional(),
});

const callbackQuerySchema = z.object({
  id: z.string(),
  from: userSchema,
  data: z.string().optional(),
  message: z.object({ message_id: z.number().int(), chat: chatSchema }).optional(),
});

// The bot's own membership in a chat changed. In a private chat, "kicked" means the user
// blocked the bot and "member" means they restarted it.
// https://core.telegram.org/bots/api#chatmemberupdated
const chatMemberUpdatedSchema = z.object({
  from: userSchema,
  chat: chatSchema,
  new_chat_member: z.object({ status: z.string() }),
});

export const updateSchema = z.object({
  update_id: z.number().int(),
  message: messageSchema.optional(),
  callback_query: callbackQuerySchema.optional(),
  my_chat_member: chatMemberUpdatedSchema.optional(),
});

export type TelegramUpdate = z.infer<typeof updateSchema>;
export type TelegramMessage = z.infer<typeof messageSchema>;
export type TelegramCallbackQuery = z.infer<typeof callbackQuerySchema>;
export type TelegramChatMemberUpdated = z.infer<typeof chatMemberUpdatedSchema>;
