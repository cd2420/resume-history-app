import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "react-router";

import { getEnv } from "./env.server";

export interface SupabaseContext {
  supabase: SupabaseClient;
  // Set-Cookie headers from token refresh; loaders/actions must forward them.
  headers: Headers;
}

export interface AuthedContext extends SupabaseContext {
  userId: string;
}

export function createSupabase(request: Request): SupabaseContext {
  const env = getEnv();
  const headers = new Headers();
  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () =>
        parseCookieHeader(request.headers.get("Cookie") ?? "").map(
          ({ name, value }) => ({ name, value: value ?? "" }),
        ),
      setAll: (cookies, cacheHeaders) => {
        cookies.forEach(({ name, value, options }) =>
          headers.append("Set-Cookie", serializeCookieHeader(name, value, options)),
        );
        Object.entries(cacheHeaders ?? {}).forEach(([key, value]) =>
          headers.set(key, value),
        );
      },
    },
  });
  return { supabase, headers };
}

// getClaims verifies the JWT, unlike getSession which trusts the cookie.
export async function requireUser(request: Request): Promise<AuthedContext> {
  const context = createSupabase(request);
  const { data, error } = await context.supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId) {
    throw redirect("/login", { headers: context.headers });
  }
  return { ...context, userId };
}
