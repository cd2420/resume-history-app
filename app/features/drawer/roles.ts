/**
 * Account tiers. A role is only ever read on the server from profiles.role (which users cannot
 * write); never from a form field, query string, cookie or JWT claim the browser could change.
 */
export type UserRole = "user" | "admin";

/** Fail closed: anything other than exactly "admin" is a regular user. */
export function parseRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user";
}

/** Admins skip the free-tier AI caps (daily sessions, AI calls per session, STARs). */
export function isUnlimited(role: UserRole): boolean {
  return role === "admin";
}
