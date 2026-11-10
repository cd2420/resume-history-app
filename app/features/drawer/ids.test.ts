import { describe, expect, test } from "vitest";

import { callbackData, decodeId, encodeId, parseCallbackData } from "./ids";

const P = "20000000-0000-4000-8000-0000000000aa";
const Q = "10000000-0000-4000-8000-0000000000bb";

describe("ids", () => {
  test("round-trips a uuid through 22 chars", () => {
    const encoded = encodeId(P);
    expect(encoded).toHaveLength(22);
    expect(decodeId(encoded)).toBe(P);
  });

  test("every callback payload fits Telegram's 64-byte limit and parses back", () => {
    const actions = [
      { kind: "save", pendingId: P },
      { kind: "edit", pendingId: P },
      { kind: "cancel", pendingId: P },
      { kind: "move", pendingId: P },
      { kind: "back", pendingId: P },
      { kind: "pick", pendingId: P, projectId: Q },
      { kind: "current", projectId: Q },
      { kind: "record" },
      { kind: "skip", sessionId: P },
    ] as const;
    for (const action of actions) {
      const data = callbackData(action);
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(parseCallbackData(data)).toEqual(action);
    }
  });

  test("rejects malformed payloads", () => {
    for (const data of ["", "s", "s:", "x:" + encodeId(P), "s:short", "p:" + encodeId(P), "u:a:b", "s:" + encodeId(P) + ":x"]) {
      expect(parseCallbackData(data)).toBeNull();
    }
  });
});
