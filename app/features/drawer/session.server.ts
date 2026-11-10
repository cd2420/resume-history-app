import { requireDemoUser } from "~/features/demo/demo-auth.server";
import { getDemoStore } from "~/features/demo/demo-store.server";
import { getEnv } from "~/lib/env.server";
import { requireUser } from "~/lib/supabase.server";
import { createSupabaseWebStore, type DrawerWebStore } from "./drawer-web.server";

export interface DrawerSession {
  userId: string;
  headers: Headers;
  store: DrawerWebStore;
  isDemo: boolean;
}

/** Signed-in user plus their data store: Supabase + RLS, or in-memory data in demo mode. */
export async function requireDrawerSession(request: Request): Promise<DrawerSession> {
  if (getEnv().isDemo) {
    const { userId, headers } = requireDemoUser(request);
    return { userId, headers, store: getDemoStore().webStoreFor(userId), isDemo: true };
  }
  const { supabase, userId, headers } = await requireUser(request);
  return { userId, headers, store: createSupabaseWebStore(supabase, userId), isDemo: false };
}
