import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";

import { FAKE_DRAFT } from "~/features/interview/fake-llm";
import { CareerError, listCareers, saveProjectDraft } from "./career.server";

function supabaseWith({ rpc, query }: { rpc?: unknown; query?: unknown }) {
  const builder = {
    select: vi.fn((_columns: string) => builder),
    order: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => resolve(query),
  };
  const client = {
    rpc: vi.fn().mockResolvedValue(rpc),
    from: vi.fn(() => builder),
  };
  return { supabase: client as unknown as SupabaseClient, client, builder };
}

async function reasonOf(promise: Promise<unknown>) {
  const thrown = await promise.catch((error: unknown) => error);
  expect(thrown).toBeInstanceOf(CareerError);
  return (thrown as CareerError).reason;
}

describe("saveProjectDraft", () => {
  test("saves the whole draft in one RPC call and returns the project id", async () => {
    const { supabase, client } = supabaseWith({ rpc: { data: "project-1", error: null } });

    const projectId = await saveProjectDraft(supabase, FAKE_DRAFT);

    expect(projectId).toBe("project-1");
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("save_project_draft", { draft: FAKE_DRAFT });
  });

  test("rejects an invalid draft without touching the database", async () => {
    const { supabase, client } = supabaseWith({});
    const broken = { ...FAKE_DRAFT, career: { ...FAKE_DRAFT.career, company_name: "" } };

    expect(await reasonOf(saveProjectDraft(supabase, broken))).toBe("invalid");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  test("fails as db when the RPC returns an error", async () => {
    const { supabase } = supabaseWith({
      rpc: { data: null, error: { code: "23514", message: "check violation" } },
    });

    expect(await reasonOf(saveProjectDraft(supabase, FAKE_DRAFT))).toBe("db");
  });
});

describe("listCareers", () => {
  test("returns careers with nested projects and achievements, newest first", async () => {
    const rows = [{ id: "career-1", company_name: "테스트컴퍼니", projects: [] }];
    const { supabase, client, builder } = supabaseWith({ query: { data: rows, error: null } });

    const careers = await listCareers(supabase);

    expect(careers).toEqual(rows);
    expect(client.from).toHaveBeenCalledWith("careers");
    expect(builder.select.mock.calls[0][0]).toMatch(/projects\s*\(.*achievements\s*\(/s);
    expect(builder.order).toHaveBeenCalledWith("start_date", expect.objectContaining({ ascending: false }));
  });

  test("fails as db when the query errors", async () => {
    const { supabase } = supabaseWith({ query: { data: null, error: { code: "42501" } } });

    expect(await reasonOf(listCareers(supabase))).toBe("db");
  });
});
