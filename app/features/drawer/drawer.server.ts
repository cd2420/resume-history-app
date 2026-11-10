import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { CHANGE_CATEGORIES, type ChangeCategory } from "./generalize.server";
import type { DrawerRepo, LinkResult, Pending } from "./repo";

export class DrawerDbError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string | undefined,
  ) {
    super(`drawer db error: ${operation}${code ? ` (${code})` : ""}`);
    this.name = "DrawerDbError";
  }
}

// Postgres error codes that mean "that row does not belong to this user".
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

function fail(operation: string, error: PostgrestError): never {
  throw new DrawerDbError(operation, error.code);
}

interface PendingRow {
  id: string;
  user_id: string;
  project_id: string;
  generalized: string;
  change_categories: string[];
  tags: string[];
  state: "confirm" | "edit";
  chat_id: number;
  card_message_id: number | null;
}

const PENDING_COLUMNS = "id, user_id, project_id, generalized, change_categories, tags, state, chat_id, card_message_id";
const RECENT_LOGS_FOR_TAGS = 200;

function toPending(row: PendingRow): Pending {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    generalized: row.generalized,
    changes: row.change_categories.filter((c): c is ChangeCategory =>
      (CHANGE_CATEGORIES as readonly string[]).includes(c),
    ),
    tags: row.tags ?? [],
    state: row.state,
    chatId: Number(row.chat_id),
    cardMessageId: row.card_message_id === null ? null : Number(row.card_message_id),
  };
}

/**
 * DrawerRepo on the secret-key client (RLS bypassed). Every query filters by the userId
 * argument; callers get that id only from telegram_links.
 */
export function createDrawerRepo(admin: SupabaseClient): DrawerRepo {
  const nowIso = () => new Date().toISOString();

  return {
    async recordUpdate(updateId) {
      const { error } = await admin.from("telegram_updates").insert({ update_id: updateId });
      if (!error) return true;
      if (error.code === UNIQUE_VIOLATION) return false;
      fail("recordUpdate", error);
    },

    async linkTelegram(tokenHash, telegramUserId, chatId) {
      const { data, error } = await admin.rpc("drawer_link_telegram", {
        p_token_hash: tokenHash,
        p_telegram_user_id: telegramUserId,
        p_chat_id: chatId,
      });
      if (error) fail("linkTelegram", error);
      return data as LinkResult;
    },

    async findLinkByTelegramUser(telegramUserId) {
      const { data, error } = await admin
        .from("telegram_links")
        .select("user_id, chat_id, blocked_at")
        .eq("telegram_user_id", telegramUserId)
        .maybeSingle();
      if (error) fail("findLink", error);
      return data ? { userId: data.user_id, chatId: Number(data.chat_id), blocked: data.blocked_at !== null } : null;
    },

    async clearBlocked(userId) {
      const { error } = await admin.from("telegram_links").update({ blocked_at: null }).eq("user_id", userId);
      if (error) fail("clearBlocked", error);
    },

    async markBlocked(userId) {
      const { error } = await admin.from("telegram_links").update({ blocked_at: nowIso() }).eq("user_id", userId);
      if (error) fail("markBlocked", error);
    },

    async getCurrentProject(userId) {
      const { data, error } = await admin
        .from("profiles")
        .select("current_project_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) fail("getCurrentProject", error);
      return data?.current_project_id ? this.getProject(userId, data.current_project_id) : null;
    },

    async listProjects(userId) {
      const { data, error } = await admin
        .from("projects")
        .select("id, title")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) fail("listProjects", error);
      return data;
    },

    async getProject(userId, projectId) {
      const { data, error } = await admin
        .from("projects")
        .select("id, title")
        .eq("user_id", userId)
        .eq("id", projectId)
        .maybeSingle();
      if (error) fail("getProject", error);
      return data;
    },

    async listTags(userId) {
      const { data, error } = await admin
        .from("daily_logs")
        .select("tags")
        .eq("user_id", userId)
        .neq("tags", "{}")
        .order("created_at", { ascending: false })
        .limit(RECENT_LOGS_FOR_TAGS);
      if (error) fail("listTags", error);
      return [...new Set((data as { tags: string[] }[]).flatMap((row) => row.tags))];
    },

    async createProject(userId, title) {
      const { data, error } = await admin
        .from("projects")
        .insert({ user_id: userId, title, career_id: null })
        .select("id, title")
        .single();
      if (error) fail("createProject", error);
      return data;
    },

    async setCurrentProject(userId, projectId) {
      const { data, error } = await admin
        .from("profiles")
        .update({ current_project_id: projectId })
        .eq("user_id", userId)
        .select("user_id");
      if (error?.code === FOREIGN_KEY_VIOLATION) return false;
      if (error) fail("setCurrentProject", error);
      return data.length === 1;
    },

    async createPending(userId, input) {
      const { data, error } = await admin
        .from("pending_logs")
        .insert({
          user_id: userId,
          project_id: input.projectId,
          generalized: input.generalized,
          change_categories: input.changes,
          tags: input.tags,
          chat_id: input.chatId,
        })
        .select(PENDING_COLUMNS)
        .single<PendingRow>();
      if (error) fail("createPending", error);
      return toPending(data);
    },

    async getPending(userId, pendingId) {
      const { data, error } = await admin
        .from("pending_logs")
        .select(PENDING_COLUMNS)
        .eq("user_id", userId)
        .eq("id", pendingId)
        .gt("expires_at", nowIso())
        .maybeSingle<PendingRow>();
      if (error) fail("getPending", error);
      return data ? toPending(data) : null;
    },

    async getEditingPending(userId) {
      const { data, error } = await admin
        .from("pending_logs")
        .select(PENDING_COLUMNS)
        .eq("user_id", userId)
        .eq("state", "edit")
        .gt("expires_at", nowIso())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<PendingRow>();
      if (error) fail("getEditingPending", error);
      return data ? toPending(data) : null;
    },

    async setCardMessage(userId, pendingId, messageId) {
      const { error } = await admin
        .from("pending_logs")
        .update({ card_message_id: messageId })
        .eq("user_id", userId)
        .eq("id", pendingId);
      if (error) fail("setCardMessage", error);
    },

    async movePending(userId, pendingId, projectId) {
      const { data, error } = await admin
        .from("pending_logs")
        .update({ project_id: projectId })
        .eq("user_id", userId)
        .eq("id", pendingId)
        .select("id");
      if (error?.code === FOREIGN_KEY_VIOLATION) return false;
      if (error) fail("movePending", error);
      return data.length === 1;
    },

    async startEditing(userId, pendingId) {
      const reset = await admin
        .from("pending_logs")
        .update({ state: "confirm" })
        .eq("user_id", userId)
        .eq("state", "edit")
        .neq("id", pendingId);
      if (reset.error) fail("startEditing", reset.error);
      const { error } = await admin
        .from("pending_logs")
        .update({ state: "edit" })
        .eq("user_id", userId)
        .eq("id", pendingId);
      if (error) fail("startEditing", error);
    },

    async deletePending(userId, pendingId) {
      const { error } = await admin.from("pending_logs").delete().eq("user_id", userId).eq("id", pendingId);
      if (error) fail("deletePending", error);
    },

    async savePendingAsLog(userId, pendingId, content, edited, logDate) {
      const { data, error } = await admin.rpc("drawer_save_pending_log", {
        p_user_id: userId,
        p_pending_id: pendingId,
        p_content: content,
        p_edited: edited,
        p_log_date: logDate,
      });
      if (error) fail("savePendingAsLog", error);
      return typeof data === "string";
    },

    async listDueNotifications(hour, kstDate) {
      const { data, error } = await admin.rpc("drawer_due_notifications", { p_hour: hour, p_kst_date: kstDate });
      if (error) fail("listDueNotifications", error);
      return (data as { user_id: string; chat_id: number }[]).map((row) => ({
        userId: row.user_id,
        chatId: Number(row.chat_id),
      }));
    },

    async claimNotification(userId, kstDate) {
      const { error } = await admin.from("notifications").insert({ user_id: userId, kst_date: kstDate });
      if (!error) return true;
      if (error.code === UNIQUE_VIOLATION) return false;
      fail("claimNotification", error);
    },

    async setNotificationStatus(userId, kstDate, status) {
      const { error } = await admin
        .from("notifications")
        .update({ status })
        .eq("user_id", userId)
        .eq("kst_date", kstDate);
      if (error) fail("setNotificationStatus", error);
    },
  };
}
