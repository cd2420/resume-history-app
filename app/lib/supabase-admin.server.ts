import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getEnv } from "./env.server";

let cachedAdmin: SupabaseClient | undefined;

/**
 * Secret-key client: bypasses RLS. Import only from app/features/drawer/drawer.server.ts,
 * whose functions take the owning userId explicitly. Never expose to the browser.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!cachedAdmin) {
    const env = getEnv();
    cachedAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return cachedAdmin;
}
