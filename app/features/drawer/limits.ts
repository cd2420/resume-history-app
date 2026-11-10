// Shared by server code and route components (must stay free of server-only imports).
export const MAX_LOG_LENGTH = 1000;
export const MAX_PROJECT_TITLE = 200;
/** One answer in a recording session (three answers make one log). */
export const ANSWER_MAX_LENGTH = 300;
/**
 * Recording sessions a user can open per KST day: one AI-assisted round of the three questions,
 * whether it started from the hourly prompt or /record. More can be written on the web without AI.
 */
export const DAILY_SESSION_LIMIT = 1;
/** STAR summaries a user can generate per KST day, across all books. */
export const DAILY_STAR_LIMIT = 1;
/** AI calls one session may make, including retries after failures. */
export const SESSION_AI_CALL_LIMIT = 5;
