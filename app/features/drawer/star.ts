// STAR summaries: shared by server code and the book page (no server-only imports).

export const STAR_FIELDS = ["situation", "task", "action", "result"] as const;
export type StarField = (typeof STAR_FIELDS)[number];

export const STAR_LABELS: Record<StarField, string> = {
  situation: "S · 상황",
  task: "T · 과제",
  action: "A · 행동",
  result: "R · 결과",
};

/**
 * Free STAR generations per book, including the first one. Regenerating costs an AI call each
 * time, so it is held back until it becomes a paid feature. The DB check still allows up to 5.
 */
export const FREE_STAR_GENERATIONS = 1;
export const MAX_STAR_TEXT = 2000;

export interface StarPart {
  text: string;
  /** Ids of the logs this part is based on. */
  evidence: string[];
  /** What the logs did not say (numbers, reasons); shown as blanks, never invented. */
  gaps: string[];
}

export type StarDraft = Record<StarField, StarPart>;
export type StarFields = Record<StarField, string>;

export interface StarSummary {
  generated: StarDraft;
  fields: StarFields;
  status: "draft" | "saved";
  edited: boolean;
  generationCount: number;
  generatedAt: string;
  savedAt: string | null;
}

export function draftFields(draft: StarDraft): StarFields {
  return { situation: draft.situation.text, task: draft.task.text, action: draft.action.text, result: draft.result.text };
}

/** Whitespace-only changes do not count as edits. */
export function isEdited(draft: StarDraft, fields: StarFields): boolean {
  return STAR_FIELDS.some((field) => draft[field].text.trim() !== fields[field].trim());
}

/** What the STAR panel tells the user before they press the button. */
export interface StarQuota {
  isUnlimited: boolean;
  /** null when there is no cap (admins). */
  remainingToday: number | null;
}
