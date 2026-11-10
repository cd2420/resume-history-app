import { redirect } from "react-router";

import { getEnv } from "~/lib/env.server";
import { DEMO_USER_ID } from "./demo-store.server";

// Demo mode only: a cookie stands in for a Supabase session. It grants access to
// in-memory sample data and nothing else.
const COOKIE = "drawer_demo_session";

function cookieAttributes(maxAge: number) {
  const secure = getEnv().APP_URL.startsWith("https://") ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function hasDemoSession(request: Request): boolean {
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.split(/;\s*/).includes(`${COOKIE}=1`);
}

export function demoLoginHeaders(): Headers {
  return new Headers({ "Set-Cookie": `${COOKIE}=1; ${cookieAttributes(60 * 60 * 24)}` });
}

export function demoLogoutHeaders(): Headers {
  return new Headers({ "Set-Cookie": `${COOKIE}=; ${cookieAttributes(0)}` });
}

export function requireDemoUser(request: Request): { userId: string; headers: Headers } {
  if (!hasDemoSession(request)) throw redirect("/login");
  return { userId: DEMO_USER_ID, headers: new Headers() };
}
