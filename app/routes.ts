import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("logout", "routes/logout.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("drawer", "routes/drawer.tsx"),
  route("drawer/consent", "routes/drawer.consent.tsx"),
  route("drawer/demo-bot", "routes/drawer.demo-bot.tsx"),
  route("api/telegram/webhook", "routes/api.telegram.webhook.ts"),
  route("api/cron/notify", "routes/api.cron.notify.ts"),
] satisfies RouteConfig;
