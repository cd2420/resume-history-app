import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { clearConsentTermsCache, createSupabaseWebStore, getConsentTerms, profileLoader } from "./drawer-web.server";

// Minimal stand-in for supabase-js: every chain resolves to the table's next queued result
// and each `.from(table)` call is counted, so tests can assert how many queries ran.
function fakeSupabase(results: Record<string, Array<{ data: unknown; error: unknown }>>) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      const queue = results[table] ?? [];
      const result = queue.length > 1 ? queue.shift()! : (queue[0] ?? { data: null, error: null });
      const chain: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      for (const method of ["select", "eq", "in", "neq", "is", "order", "limit", "update", "insert", "delete"]) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = () => chain;
      chain.single = () => chain;
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const TERM_ROWS = [
  { kind: "privacy", version: "v1", title: "개인정보", items: ["a"], published_at: "2026-11-10T00:00:00Z" },
  { kind: "overseas_transfer", version: "v1", title: "국외 이전", items: ["b"], published_at: "2026-11-10T00:00:00Z" },
  { kind: "telegram", version: "v1", title: "텔레그램", items: ["c"], published_at: "2026-11-10T00:00:00Z" },
];

beforeEach(() => clearConsentTermsCache());
afterEach(() => clearConsentTermsCache());

describe("getConsentTerms cache", () => {
  test("reads the terms once and serves later calls, including the Telegram term, from memory", async () => {
    const { client, calls } = fakeSupabase({ consent_terms: [{ data: TERM_ROWS, error: null }] });

    const required = await getConsentTerms(client, undefined, 0);
    const [telegram] = await getConsentTerms(client, ["telegram"], 1000);

    expect(required.map((t) => t.kind)).toEqual(["privacy", "overseas_transfer"]);
    expect(telegram.title).toBe("텔레그램");
    expect(calls).toEqual(["consent_terms"]);
  });

  test("reads again after five minutes", async () => {
    const { client, calls } = fakeSupabase({ consent_terms: [{ data: TERM_ROWS, error: null }] });

    await getConsentTerms(client, undefined, 0);
    await getConsentTerms(client, undefined, 5 * 60 * 1000 + 1);

    expect(calls).toHaveLength(2);
  });

  test("does not cache a failed read", async () => {
    const { client, calls } = fakeSupabase({
      consent_terms: [
        { data: null, error: { code: "57014" } },
        { data: TERM_ROWS, error: null },
      ],
    });

    await expect(getConsentTerms(client, undefined, 0)).rejects.toThrow();
    await expect(getConsentTerms(client, undefined, 1)).resolves.toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  test("a missing Telegram term does not break the required terms", async () => {
    const { client } = fakeSupabase({ consent_terms: [{ data: TERM_ROWS.slice(0, 2), error: null }] });

    await expect(getConsentTerms(client, undefined, 0)).resolves.toHaveLength(2);
    await expect(getConsentTerms(client, ["telegram"], 1)).rejects.toThrow(/telegram/);
  });
});

describe("one profile read per request", () => {
  const PROFILE = { notify_hour: 21, current_project_id: "p1", role: "admin" };

  test("profileLoader reads once until reset", async () => {
    const { client, calls } = fakeSupabase({ profiles: [{ data: PROFILE, error: null }] });
    const profile = profileLoader(client, "u");

    await Promise.all([profile.load(), profile.load(), profile.load()]);
    expect(calls).toEqual(["profiles"]);

    profile.reset();
    await profile.load();
    expect(calls).toEqual(["profiles", "profiles"]);
  });

  test("role and setup status share a profile read; a profile write makes the next read fresh", async () => {
    const { client, calls } = fakeSupabase({
      profiles: [{ data: PROFILE, error: null }],
      telegram_links: [{ data: { linked_at: "2026-11-10T00:00:00Z", blocked_at: null }, error: null }],
    });
    const store = createSupabaseWebStore(client, "u");

    const [role, status] = await Promise.all([store.getRole(), store.getSetupStatus()]);
    expect(role).toBe("admin");
    expect(status).toEqual({ notifyHour: 21, telegram: { linkedAt: "2026-11-10T00:00:00Z", blocked: false } });
    expect(calls.filter((t) => t === "profiles")).toHaveLength(1);

    await store.setNotifyHour(9);
    await store.getRole();
    // read, write, read again
    expect(calls.filter((t) => t === "profiles")).toHaveLength(3);
  });
});
