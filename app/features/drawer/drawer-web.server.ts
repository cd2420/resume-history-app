import type { SupabaseClient } from "@supabase/supabase-js";

import { type BookshelfStore, createSupabaseBookshelf } from "./bookshelf.server";
import { CONSENT_KINDS, type ConsentKind, type ConsentTerm, currentTerms, hasConsentedTo, TELEGRAM_CONSENT_KIND } from "./consent";
import { createLinkToken, LINK_TOKEN_TTL_MS } from "./link-token.server";
import { draftFields, type StarDraft, type StarFields, type StarSummary } from "./star";

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

/** The current terms: latest published row per kind (RLS hides unpublished rows). */
export async function getConsentTerms(
  supabase: SupabaseClient,
  kinds: readonly ConsentKind[] = CONSENT_KINDS,
): Promise<ConsentTerm[]> {
  const rows = check(
    "getConsentTerms",
    await supabase.from("consent_terms").select("kind, version, title, items, published_at").in("kind", kinds),
  );
  return currentTerms(rows.map(({ published_at, ...term }) => ({ ...term, publishedAt: published_at })), kinds);
}

export async function getTelegramTerm(supabase: SupabaseClient): Promise<ConsentTerm> {
  const [term] = await getConsentTerms(supabase, [TELEGRAM_CONSENT_KIND]);
  return term;
}

/** Records consent to `term` unless this user already agreed to that exact version. */
export async function ensureConsent(supabase: SupabaseClient, userId: string, term: ConsentTerm): Promise<void> {
  const existing = checkMaybe(
    "ensureConsent.find",
    await supabase
      .from("consents")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", term.kind)
      .eq("version", term.version)
      .limit(1),
  );
  if (existing && existing.length > 0) return;
  await recordConsents(supabase, userId, [term]);
}

export async function hasRequiredConsents(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const [terms, consents] = await Promise.all([
    getConsentTerms(supabase),
    supabase.from("consents").select("kind, version").eq("user_id", userId),
  ]);
  return hasConsentedTo(terms, check("hasRequiredConsents", consents));
}

export async function recordConsents(supabase: SupabaseClient, userId: string, terms: ConsentTerm[]): Promise<void> {
  checkWrite(
    "recordConsents",
    await supabase
      .from("consents")
      .insert(terms.map((term) => ({ user_id: userId, kind: term.kind, version: term.version }))),
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

/** shelfId files the new book on that shelf; null leaves it on the "newly shelved" shelf. */
export async function createProject(supabase: SupabaseClient, userId: string, title: string, shelfId: string | null = null): Promise<void> {
  const { data: project, error } = await supabase
    .from("projects")
    .insert({ user_id: userId, title, career_id: null, shelf_id: shelfId })
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

// Written on the web: saved as typed (no AI), untagged until the user adds tags on the book page. The composite FK
// (project_id, user_id) refuses another user's book.
export async function createLog(supabase: SupabaseClient, userId: string, projectId: string, logDate: string, content: string) {
  checkWrite(
    "createLog",
    await supabase
      .from("daily_logs")
      .insert({ user_id: userId, project_id: projectId, log_date: logDate, content, source: "web" }),
  );
}

interface StarRow {
  generated: StarDraft;
  situation: string;
  task: string;
  action: string;
  result: string;
  status: "draft" | "saved";
  edited: boolean;
  generation_count: number;
  generated_at: string;
  saved_at: string | null;
}

export async function getStar(supabase: SupabaseClient, userId: string, projectId: string): Promise<StarSummary | null> {
  const row = checkMaybe(
    "getStar",
    await supabase
      .from("star_summaries")
      .select("generated, situation, task, action, result, status, edited, generation_count, generated_at, saved_at")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .maybeSingle<StarRow>(),
  );
  if (!row) return null;
  return {
    generated: row.generated,
    fields: { situation: row.situation, task: row.task, action: row.action, result: row.result },
    status: row.status,
    edited: row.edited,
    generationCount: row.generation_count,
    generatedAt: row.generated_at,
    savedAt: row.saved_at,
  };
}

export async function putStarDraft(supabase: SupabaseClient, userId: string, projectId: string, draft: StarDraft, count: number) {
  const now = new Date().toISOString();
  checkWrite(
    "putStarDraft",
    await supabase.from("star_summaries").upsert({
      project_id: projectId,
      user_id: userId,
      generated: draft,
      ...draftFields(draft),
      status: "draft",
      edited: false,
      generation_count: count,
      generated_at: now,
      saved_at: null,
    }),
  );
  // The first summary marks the project as finished; regenerating keeps the original end date.
  checkWrite(
    "putStarDraft.end",
    await supabase.from("projects").update({ ended_at: now }).eq("user_id", userId).eq("id", projectId).is("ended_at", null),
  );
  // An ended book stops being the bot's current book; the bot then asks for a new one.
  checkWrite(
    "putStarDraft.current",
    await supabase
      .from("profiles")
      .update({ current_project_id: null })
      .eq("user_id", userId)
      .eq("current_project_id", projectId),
  );
}

export async function saveStarFields(supabase: SupabaseClient, userId: string, projectId: string, fields: StarFields, edited: boolean) {
  checkWrite(
    "saveStar",
    await supabase
      .from("star_summaries")
      .update({ ...fields, status: "saved", edited, saved_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("project_id", projectId),
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
  getConsentTerms(): Promise<ConsentTerm[]>;
  hasRequiredConsents(): Promise<boolean>;
  recordConsents(terms: ConsentTerm[]): Promise<void>;
  getTelegramTerm(): Promise<ConsentTerm>;
  ensureConsent(term: ConsentTerm): Promise<void>;
  getOverview(): Promise<DrawerOverview>;
  issueLinkToken(): Promise<string>;
  unlinkTelegram(): Promise<void>;
  setNotifyHour(hour: number | null): Promise<void>;
  createProject(title: string, shelfId?: string | null): Promise<void>;
  renameProject(projectId: string, title: string): Promise<void>;
  setCurrentProject(projectId: string): Promise<void>;
  createLog(projectId: string, logDate: string, content: string): Promise<void>;
  getStar(projectId: string): Promise<StarSummary | null>;
  /** Stores a fresh generated draft (replacing any earlier one) and marks the book ended. */
  putStarDraft(projectId: string, draft: StarDraft, generationCount: number): Promise<void>;
  saveStar(projectId: string, fields: StarFields, edited: boolean): Promise<void>;
  updateLog(logId: string, content: string): Promise<void>;
  deleteLog(logId: string): Promise<void>;
}

export function createSupabaseWebStore(supabase: SupabaseClient, userId: string): DrawerWebStore {
  return {
    ...createSupabaseBookshelf(supabase, userId),
    getConsentTerms: () => getConsentTerms(supabase),
    hasRequiredConsents: () => hasRequiredConsents(supabase, userId),
    recordConsents: (terms) => recordConsents(supabase, userId, terms),
    getTelegramTerm: () => getTelegramTerm(supabase),
    ensureConsent: (term) => ensureConsent(supabase, userId, term),
    getOverview: () => getDrawerOverview(supabase, userId),
    issueLinkToken: () => issueLinkToken(supabase, userId),
    unlinkTelegram: () => unlinkTelegram(supabase, userId),
    setNotifyHour: (hour) => setNotifyHour(supabase, userId, hour),
    createProject: (title, shelfId) => createProject(supabase, userId, title, shelfId ?? null),
    renameProject: (projectId, title) => renameProject(supabase, userId, projectId, title),
    setCurrentProject: (projectId) => setCurrentProject(supabase, userId, projectId),
    createLog: (projectId, logDate, content) => createLog(supabase, userId, projectId, logDate, content),
    getStar: (projectId) => getStar(supabase, userId, projectId),
    putStarDraft: (projectId, draft, count) => putStarDraft(supabase, userId, projectId, draft, count),
    saveStar: (projectId, fields, edited) => saveStarFields(supabase, userId, projectId, fields, edited),
    updateLog: (logId, content) => updateLog(supabase, userId, logId, content),
    deleteLog: (logId) => deleteLog(supabase, userId, logId),
  };
}
