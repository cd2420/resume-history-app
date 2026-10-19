import { z } from "zod";

// Limits mirror the check constraints in supabase/migrations/*_career_schema.sql.
const MAX_TURNS = 60;
const MAX_TURN_LENGTH = 4000;

const yearMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .nullable()
  .describe("YYYY-MM, null if unknown");

export const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(MAX_TURN_LENGTH),
});

export const chatTurnsSchema = z.array(chatTurnSchema).max(MAX_TURNS);

export type ChatTurn = z.infer<typeof chatTurnSchema>;

// Every field is required (nullable instead of optional) for OpenAI strict structured output.
export const projectDraftSchema = z.object({
  career: z.object({
    company_name: z.string().min(1).max(200),
    company_desc: z.string().max(500).nullable(),
    role: z.string().max(200).nullable(),
    start_date: yearMonth,
    end_date: yearMonth,
  }),
  project: z.object({
    title: z.string().min(1).max(200),
    summary: z.string().max(2000).nullable(),
    my_role: z.string().max(500).nullable(),
    tech_stack: z.array(z.string().min(1).max(50)).max(30),
    team_size: z.int().positive().nullable(),
    start_date: yearMonth,
    end_date: yearMonth,
  }),
  achievements: z
    .array(
      z.object({
        action: z.string().min(1).max(2000),
        decision: z.string().max(2000).nullable(),
        impact: z.string().max(2000).nullable(),
      }),
    )
    .max(10),
  // Shown to the user before saving; must name the kind of detail, never the original value.
  generalized: z
    .array(z.string().max(300))
    .max(20)
    .describe("Each generalization as 'kind of detail -> replacement', e.g. '고객사명 -> 대형 유통사'. Never include the original value."),
});

export type ProjectDraft = z.infer<typeof projectDraftSchema>;
