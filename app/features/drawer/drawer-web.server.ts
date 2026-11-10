import type { SupabaseClient } from "@supabase/supabase-js";

import { type BookshelfStore, createSupabaseBookshelf } from "./bookshelf.server";
import { createLinkToken, LINK_TOKEN_TTL_MS } from "./link-token.server";

// Bump when the consent text changes; users re-consent to the new version.
export const CONSENT_VERSION = "2026-11-10";
const REQUIRED_CONSENTS = ["privacy", "overseas_transfer"] as const;
const LOG_LIMIT = 300;

export class DrawerWebError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string | undefined,
  ) {
    super(`drawer web error: ${operation}`);
    this.name = "DrawerWebError";
  }
}

type DbResult<T> = { data: T | null; error: { code?: string } | null };

function checkMaybe<T>(operation: string, result: DbResult<T>): T | null {
  if (result.error) throw new DrawerWebError(operation, result.error.code);
  return result.data;
}

function check<T>(operation: string, result: DbResult<T>): NonNullable<T> {
  const value = checkMaybe(operation, result);
  if (value === null || value === undefined) throw new DrawerWebError(operation, "no_data");
  return value as NonNullable<T>;
}

function checkWrite(operation: string, result: { error: { code?: string } | null }): void {
  if (result.error) throw new DrawerWebError(operation, result.error.code);
}

export interface DrawerProject {
  id: string;
  title: string;
}

export interface DrawerLog {
  id: string;
  project_id: string;
  log_date: string;
  content: string;
  edited: boolean;
  source: "telegram" | "web";
}

export interface DrawerOverview {
  notifyHour: number | null;
  currentProjectId: string | null;
  telegram: { linkedAt: string; blocked: boolean } | null;
  projects: DrawerProject[];
  logs: DrawerLog[];
}

// All functions below use the user's session client, so RLS scopes every row to them.
// userId filters duplicate the policy for query plans and as a second guard.

export async function hasRequiredConsents(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const rows = check(
    "hasRequiredConsents",
    await supabase.from("consents").select("kind").eq("user_id", userId).eq("version", CONSENT_VERSION),
  );
  const kinds = new Set(rows.map((row) => row.kind));
  return REQUIRED_CONSENTS.every((kind) => kinds.has(kind));
}

export async function recordConsents(supabase: SupabaseClient, userId: string): Promise<void> {
  checkWrite(
    "recordConsents",
    await supabase
      .from("consents")
      .insert(REQUIRED_CONSENTS.map((kind) => ({ user_id: userId, kind, version: CONSENT_VERSION }))),
  );
}

export async function getDrawerOverview(supabase: SupabaseClient, userId: string): Promise<DrawerOverview> {
  const [profile, link, projects, logs] = await Promise.all([
    supabase.from("profiles").select("notify_hour, current_project_id").eq("user_id", userId).maybeSingle(),
    supabase.from("telegram_links").select("linked_at, blocked_at").eq("user_id", userId).maybeSingle(),
    supabase.from("projects").select("id, title").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase
      .from("daily_logs")
      .select("id, project_id, log_date, content, edited, source")
      .eq("user_id", userId)
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LOG_LIMIT),
  ]);
  const profileRow = checkMaybe("overview.profile", profile);
  const linkRow = checkMaybe("overview.link", link);
  return {
    notifyHour: profileRow?.notify_hour ?? null,
    currentProjectId: profileRow?.current_project_id ?? null,
    telegram: linkRow ? { linkedAt: linkRow.linked_at, blocked: linkRow.blocked_at !== null } : null,
    projects: check("overview.projects", projects),
    logs: check("overview.logs", logs) as DrawerLog[],
  };
}

/** Returns the raw single-use token for the deep link; only its hash is stored. */
export async function issueLinkToken(supabase: SupabaseClient, userId: string, now = new Date()): Promise<string> {
  const { token, tokenHash } = createLinkToken();
  checkWrite(
    "issueLinkToken",
    await supabase.from("telegram_link_tokens").insert({
      token_hash: tokenHash,
      user_id: userId,
      expires_at: new Date(now.getTime() + LINK_TOKEN_TTL_MS).toISOString(),
    }),
  );
  return token;
}

export async function unlinkTelegram(supabase: SupabaseClient, userId: string): Promise<void> {
  checkWrite("unlinkTelegram", await supabase.from("telegram_links").delete().eq("user_id", userId));
}

export async function setNotifyHour(supabase: SupabaseClient, userId: string, hour: number | null): Promise<void> {
  checkWrite("setNotifyHour", await supabase.from("profiles").update({ notify_hour: hour }).eq("user_id", userId));
}

export async function createProject(supabase: SupabaseClient, userId: string, title: string): Promise<void> {
  const { data: project, error } = await supabase
    .from("projects")
    .insert({ user_id: userId, title, career_id: null })
    .select("id")
    .single<{ id: string }>();
  if (error || !project) throw new DrawerWebError("createProject", error?.code);
  // The first project becomes current so the bot can file answers right away.
  checkWrite(
    "createProject.current",
    await supabase
      .from("profiles")
      .update({ current_project_id: project.id })
      .eq("user_id", userId)
      .is("current_project_id", null),
  );
}

export async function renameProject(supabase: SupabaseClient, userId: string, projectId: string, title: string) {
  checkWrite("renameProject", await supabase.from("projects").update({ title }).eq("user_id", userId).eq("id", projectId));
}

export async function setCurrentProject(supabase: SupabaseClient, userId: string, projectId: string) {
  checkWrite(
    "setCurrentProject",
    await supabase.from("profiles").update({ current_project_id: projectId }).eq("user_id", userId),
  );
}

// Web edits are saved as typed, like the bot's [수정] flow.
export async function updateLog(supabase: SupabaseClient, userId: string, logId: string, content: string) {
  checkWrite(
    "updateLog",
    await supabase.from("daily_logs").update({ content, edited: true }).eq("user_id", userId).eq("id", logId),
  );
}

export async function deleteLog(supabase: SupabaseClient, userId: string, logId: string) {
  checkWrite("deleteLog", await supabase.from("daily_logs").delete().eq("user_id", userId).eq("id", logId));
}

/** The /drawer pages' data operations, bound to one signed-in user. */
export interface DrawerWebStore extends BookshelfStore {
  hasRequiredConsents(): Promise<boolean>;
  recordConsents(): Promise<void>;
  getOverview(): Promise<DrawerOverview>;
  issueLinkToken(): Promise<string>;
  unlinkTelegram(): Promise<void>;
  setNotifyHour(hour: number | null): Promise<void>;
  createProject(title: string): Promise<void>;
  renameProject(projectId: string, title: string): Promise<void>;
  setCurrentProject(projectId: string): Promise<void>;
  updateLog(logId: string, content: string): Promise<void>;
  deleteLog(logId: string): Promise<void>;
}

export function createSupabaseWebStore(supabase: SupabaseClient, userId: string): DrawerWebStore {
  return {
    ...createSupabaseBookshelf(supabase, userId),
    hasRequiredConsents: () => hasRequiredConsents(supabase, userId),
    recordConsents: () => recordConsents(supabase, userId),
    getOverview: () => getDrawerOverview(supabase, userId),
    issueLinkToken: () => issueLinkToken(supabase, userId),
    unlinkTelegram: () => unlinkTelegram(supabase, userId),
    setNotifyHour: (hour) => setNotifyHour(supabase, userId, hour),
    createProject: (title) => createProject(supabase, userId, title),
    renameProject: (projectId, title) => renameProject(supabase, userId, projectId, title),
    setCurrentProject: (projectId) => setCurrentProject(supabase, userId, projectId),
    updateLog: (logId, content) => updateLog(supabase, userId, logId, content),
    deleteLog: (logId) => deleteLog(supabase, userId, logId),
  };
}
