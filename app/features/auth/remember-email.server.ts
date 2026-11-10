import { createCookie } from "react-router";
import { z } from "zod";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Unsigned on purpose: the value is only a form prefill, and it is re-validated on read.
// Path is "/" rather than "/login": client navigations load loader data from /login.data,
// which a Path=/login cookie does not match.
const rememberEmailCookie = createCookie("remember_email", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: ONE_YEAR_SECONDS,
});

const emailSchema = z.email();

/** The saved email, or null when absent or not a well-formed email. */
export async function readRememberedEmail(request: Request): Promise<string | null> {
  const value: unknown = await rememberEmailCookie.parse(request.headers.get("Cookie"));
  const parsed = emailSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Copies `headers` and appends a Set-Cookie that saves `email`, or clears it when null.
 * Existing Set-Cookie headers (session cookies) are kept.
 */
export async function withRememberedEmail(
  headers: Headers,
  email: string | null,
  secure: boolean,
): Promise<Headers> {
  const next = new Headers(headers);
  const cookie =
    email === null
      ? await rememberEmailCookie.serialize("", { secure, maxAge: 0 })
      : await rememberEmailCookie.serialize(email, { secure });
  next.append("Set-Cookie", cookie);
  return next;
}
