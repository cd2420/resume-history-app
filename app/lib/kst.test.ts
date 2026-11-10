import { describe, expect, test } from "vitest";

import { kstDate, kstHour, kstNextMidnight } from "./kst";

describe("kst", () => {
  test("14:59 UTC is still the same KST day at 23h", () => {
    const now = new Date("2026-11-10T14:59:59Z");
    expect(kstDate(now)).toBe("2026-11-10");
    expect(kstHour(now)).toBe(23);
  });

  test("15:00 UTC rolls over to the next KST day at 0h", () => {
    const now = new Date("2026-11-10T15:00:00Z");
    expect(kstDate(now)).toBe("2026-11-11");
    expect(kstHour(now)).toBe(0);
  });

  test("handles month and year boundaries", () => {
    expect(kstDate(new Date("2026-12-31T15:30:00Z"))).toBe("2027-01-01");
  });
});

describe("kstNextMidnight", () => {
  test("is the end of the current KST day", () => {
    expect(kstNextMidnight(new Date("2026-11-10T12:00:00Z")).toISOString()).toBe("2026-11-10T15:00:00.000Z");
    // 2026-11-11 00:30 KST -> ends at 2026-11-12 00:00 KST
    expect(kstNextMidnight(new Date("2026-11-10T15:30:00Z")).toISOString()).toBe("2026-11-11T15:00:00.000Z");
  });
});
