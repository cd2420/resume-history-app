import type { SupabaseClient } from "@supabase/supabase-js";

import { projectDraftSchema } from "~/features/interview/schema";

export interface Achievement {
  id: string;
  action: string;
  decision: string | null;
  impact: string | null;
}

export interface Project {
  id: string;
  title: string;
  summary: string | null;
  my_role: string | null;
  tech_stack: string[];
  team_size: number | null;
  start_date: string | null;
  end_date: string | null;
  achievements: Achievement[];
}

export interface CareerWithProjects {
  id: string;
  company_name: string;
  company_desc: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  projects: Project[];
}

export type CareerFailure = "invalid" | "db";

export class CareerError extends Error {
  constructor(
    readonly reason: CareerFailure,
    options?: { cause?: unknown },
  ) {
    super(`career failed: ${reason}`, options);
    this.name = "CareerError";
  }
}

const CAREER_SELECT = `
  id, company_name, company_desc, role, start_date, end_date,
  projects (
    id, title, summary, my_role, tech_stack, team_size, start_date, end_date,
    achievements ( id, action, decision, impact )
  )`;

// The draft comes back from the browser after user edits, so it is re-validated here.
// The RPC inserts career, project and achievements in one transaction (see migration).
export async function saveProjectDraft(supabase: SupabaseClient, draft: unknown): Promise<string> {
  const parsed = projectDraftSchema.safeParse(draft);
  if (!parsed.success) throw new CareerError("invalid", { cause: parsed.error });

  const { data, error } = await supabase.rpc("save_project_draft", { draft: parsed.data });
  if (error || typeof data !== "string") throw new CareerError("db", { cause: error });
  return data;
}

export async function listCareers(supabase: SupabaseClient): Promise<CareerWithProjects[]> {
  const { data, error } = await supabase
    .from("careers")
    .select(CAREER_SELECT)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("start_date", { referencedTable: "projects", ascending: false, nullsFirst: false });
  if (error) throw new CareerError("db", { cause: error });
  return (data ?? []) as CareerWithProjects[];
}
