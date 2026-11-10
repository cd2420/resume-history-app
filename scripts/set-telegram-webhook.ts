// Points the bot in TELEGRAM_BOT_TOKEN at APP_URL/api/telegram/webhook.
// Run once per environment with that environment's bot (production bot ≠ dev bot):
//   node --env-file=.env scripts/set-telegram-webhook.ts
// https://core.telegram.org/bots/api#setwebhook

export {};

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.APP_URL?.replace(/\/+$/, "");

if (!token || !secret || !appUrl) {
  console.error("TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and APP_URL are required");
  process.exit(1);
}
if (!appUrl.startsWith("https://")) {
  console.error("Telegram webhooks require an https APP_URL");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${appUrl}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    drop_pending_updates: true,
  }),
});
const result = (await response.json()) as { ok: boolean; description?: string };
if (!result.ok) {
  console.error("setWebhook failed:", result.description);
  process.exit(1);
}
console.log(`Webhook set to ${appUrl}/api/telegram/webhook`);
