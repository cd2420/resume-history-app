import { describe, expect, test } from "vitest";

import { type ConsentTerm, currentTerms, hasConsentedTo, shownVersionsMatch } from "./consent";

function term(kind: ConsentTerm["kind"], version: string, publishedAt: string): ConsentTerm & { publishedAt: string } {
  return { kind, version, title: kind, items: ["항목"], publishedAt };
}

describe("currentTerms", () => {
  test("picks the latest published version of each kind, in a fixed order", () => {
    const rows = [
      term("overseas_transfer", "v1", "2026-11-10T00:00:00Z"),
      term("privacy", "v1", "2026-11-10T00:00:00Z"),
      term("privacy", "v2", "2026-12-01T00:00:00Z"),
    ];

    expect(currentTerms(rows).map((t) => `${t.kind}:${t.version}`)).toEqual(["privacy:v2", "overseas_transfer:v1"]);
  });

  test("throws when a required kind has no published terms", () => {
    expect(() => currentTerms([term("privacy", "v1", "2026-11-10T00:00:00Z")])).toThrow(/overseas_transfer/);
  });
});

describe("hasConsentedTo", () => {
  const terms = currentTerms([
    term("privacy", "v2", "2026-12-01T00:00:00Z"),
    term("overseas_transfer", "v1", "2026-11-10T00:00:00Z"),
  ]);

  test("true only when every current version was agreed to", () => {
    const both = [
      { kind: "privacy", version: "v2" },
      { kind: "overseas_transfer", version: "v1" },
    ];
    expect(hasConsentedTo(terms, both)).toBe(true);
  });

  test("an agreement to an older version does not count", () => {
    const old = [
      { kind: "privacy", version: "v1" },
      { kind: "overseas_transfer", version: "v1" },
    ];
    expect(hasConsentedTo(terms, old)).toBe(false);
  });
});

describe("shownVersionsMatch", () => {
  const terms = currentTerms([
    term("privacy", "v2", "2026-12-01T00:00:00Z"),
    term("overseas_transfer", "v1", "2026-11-10T00:00:00Z"),
  ]);

  test("accepts the versions that were shown", () => {
    const form = new FormData();
    form.set("version_privacy", "v2");
    form.set("version_overseas_transfer", "v1");
    expect(shownVersionsMatch(terms, form)).toBe(true);
  });

  test("rejects a submit made against terms that changed since the page loaded", () => {
    const form = new FormData();
    form.set("version_privacy", "v1");
    form.set("version_overseas_transfer", "v1");
    expect(shownVersionsMatch(terms, form)).toBe(false);
  });
});
