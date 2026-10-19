import { beforeEach, describe, expect, test, vi } from "vitest";

import { requireUser } from "./supabase.server";

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test-secret-value");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon-test-secret-value");
});

async function catchThrown(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (thrown) {
    return thrown;
  }
  throw new Error("expected requireUser to throw");
}

describe("requireUser", () => {
  test("redirects to /login when the request has no session cookie", async () => {
    const request = new Request("http://localhost/onboarding");

    const thrown = await catchThrown(requireUser(request));

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get("Location")).toBe("/login");
  });

  test("redirects to /login when the session cookie is garbage", async () => {
    const request = new Request("http://localhost/onboarding", {
      headers: { Cookie: "sb-example-auth-token=not-a-real-token" },
    });

    const thrown = await catchThrown(requireUser(request));

    expect((thrown as Response).headers.get("Location")).toBe("/login");
  });
});
