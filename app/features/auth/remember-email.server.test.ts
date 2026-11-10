import { describe, expect, it } from "vitest";

import { readRememberedEmail, withRememberedEmail } from "./remember-email.server";

function requestWith(setCookie: string): Request {
  const pair = setCookie.split(";")[0];
  return new Request("http://localhost/login", { headers: { Cookie: pair } });
}

describe("remember email cookie", () => {
  it("round-trips a saved email and keeps existing Set-Cookie headers", async () => {
    const session = new Headers({ "Set-Cookie": "sb-session=abc; Path=/" });
    const headers = await withRememberedEmail(session, "me@example.com", true);

    const cookies = headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toBe("sb-session=abc; Path=/");
    const saved = cookies[1];
    expect(saved).toMatch(/^remember_email=/);
    expect(saved).toMatch(/Path=\/(;|$)/);
    expect(saved).toMatch(/HttpOnly/);
    expect(saved).toMatch(/SameSite=Lax/);
    expect(saved).toMatch(/Secure/);
    expect(saved).toMatch(/Max-Age=31536000/);
    expect(session.getSetCookie()).toHaveLength(1);

    expect(await readRememberedEmail(requestWith(saved))).toBe("me@example.com");
  });

  it("omits Secure when not requested", async () => {
    const headers = await withRememberedEmail(new Headers(), "me@example.com", false);
    expect(headers.getSetCookie()[0]).not.toMatch(/Secure/);
  });

  it("clears the cookie when email is null", async () => {
    const headers = await withRememberedEmail(new Headers(), null, false);
    const cleared = headers.getSetCookie()[0];
    expect(cleared).toMatch(/Max-Age=0/);
    expect(await readRememberedEmail(requestWith(cleared))).toBeNull();
  });

  it("ignores a missing or malformed cookie", async () => {
    expect(await readRememberedEmail(new Request("http://localhost/login"))).toBeNull();
    const notEmail = await withRememberedEmail(new Headers(), "not-an-email", false);
    expect(await readRememberedEmail(requestWith(notEmail.getSetCookie()[0]))).toBeNull();
    const garbage = new Request("http://localhost/login", { headers: { Cookie: "remember_email=%%%" } });
    expect(await readRememberedEmail(garbage)).toBeNull();
  });
});
