import { redirect } from "react-router";

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

/**
 * For loaders: checks the consents and runs `load` at the same time instead of one after
 * the other. `load` only reads the user's own rows (RLS), so starting it before the check
 * finishes is safe; its result is dropped if the user still has to consent.
 */
export async function loadWithConsent<T>(
  request: Request,
  load: (session: DrawerSession) => Promise<T>,
): Promise<{ session: DrawerSession; data: T }> {
  const session = await requireDrawerSession(request);
  const [consented, loaded] = await Promise.allSettled([session.store.hasRequiredConsents(), load(session)]);
  if (consented.status === "rejected") throw consented.reason;
  if (!consented.value) throw redirect("/drawer/consent", { headers: session.headers });
  if (loaded.status === "rejected") throw loaded.reason;
  return { session, data: loaded.value };
}

/** Like requireDrawerSession, but sends users without the required consents to /drawer/consent. */
export async function requireConsentedSession(request: Request): Promise<DrawerSession> {
  const session = await requireDrawerSession(request);
  if (!(await session.store.hasRequiredConsents())) {
    throw redirect("/drawer/consent", { headers: session.headers });
  }
  return session;
}
