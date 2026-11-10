import { describe, expect, test } from "vitest";

import { createLinkToken, hashLinkToken, isLinkTokenShape, secretsMatch } from "./link-token.server";

describe("link token", () => {
  test("fits Telegram's start parameter: <= 64 chars of A-Z a-z 0-9 _ -", () => {
    for (let i = 0; i < 50; i++) {
      const { token } = createLinkToken();
      expect(token.length).toBeLessThanOrEqual(64);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(isLinkTokenShape(token)).toBe(true);
    }
  });

  test("stores only a 64-hex SHA-256 hash that matches the token", () => {
    const { token, tokenHash } = createLinkToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashLinkToken(token));
    expect(tokenHash).not.toContain(token);
  });

  test("tokens are unique", () => {
    const seen = new Set(Array.from({ length: 100 }, () => createLinkToken().token));
    expect(seen.size).toBe(100);
  });

  test("rejects malformed tokens", () => {
    expect(isLinkTokenShape("short")).toBe(false);
    expect(isLinkTokenShape("a".repeat(42) + "!")).toBe(false);
  });
});

describe("secretsMatch", () => {
  test("matches only the exact secret", () => {
    expect(secretsMatch("s3cret", "s3cret")).toBe(true);
    expect(secretsMatch("s3cre", "s3cret")).toBe(false);
    expect(secretsMatch(null, "s3cret")).toBe(false);
    expect(secretsMatch("", "s3cret")).toBe(false);
  });
});
