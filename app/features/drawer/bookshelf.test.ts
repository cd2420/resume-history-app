import { describe, expect, test } from "vitest";

import {
  type BookSummary,
  formatPeriod,
  groupByMonth,
  hasFilters,
  isLoggableDate,
  monthBounds,
  parseSearchFilters,
  sortBooks,
} from "./bookshelf";

function book(overrides: Partial<BookSummary>): BookSummary {
  return {
    id: "b",
    title: "t",
    shelfId: null,
    firstLog: null,
    lastLog: null,
    logCount: 0,
    topTags: [],
    isCurrent: false,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("parseSearchFilters", () => {
  test("reads trimmed text and valid months, drops the rest", () => {
    const filters = parseSearchFilters(new URLSearchParams("q=%20캐시%20&tag=Kafka&from=2026-13&to=2026-11"));
    expect(filters).toEqual({ q: "캐시", tag: "Kafka", from: null, to: "2026-11" });
    expect(hasFilters(filters)).toBe(true);
    expect(hasFilters(parseSearchFilters(new URLSearchParams("q=%20")))).toBe(false);
  });
});

describe("monthBounds", () => {
  test("covers whole months, including leap February", () => {
    expect(monthBounds("2028-02", "2028-02")).toEqual({ fromDate: "2028-02-01", toDate: "2028-02-29" });
    expect(monthBounds(null, "2026-12")).toEqual({ fromDate: null, toDate: "2026-12-31" });
  });
});

describe("sortBooks", () => {
  test("current first, then most recent log, then newest created", () => {
    const sorted = sortBooks([
      book({ id: "old", lastLog: "2026-01-01" }),
      book({ id: "empty-new", createdAt: "2026-11-01T00:00:00Z" }),
      book({ id: "recent", lastLog: "2026-11-01" }),
      book({ id: "current", lastLog: "2025-01-01", isCurrent: true }),
    ]);
    expect(sorted.map((b) => b.id)).toEqual(["current", "recent", "old", "empty-new"]);
  });
});

describe("groupByMonth", () => {
  test("groups consecutive logs by month in order", () => {
    const groups = groupByMonth([
      { logDate: "2026-11-09" },
      { logDate: "2026-11-01" },
      { logDate: "2026-10-21" },
    ]);
    expect(groups.map((g) => [g.month, g.logs.length])).toEqual([["2026-11", 2], ["2026-10", 1]]);
  });
});

describe("formatPeriod", () => {
  test("open-ended for the current book, a range otherwise", () => {
    expect(formatPeriod({ firstLog: "2025-03-02", lastLog: "2026-11-09", isCurrent: true })).toBe("25.03 ~");
    expect(formatPeriod({ firstLog: "2024-07-01", lastLog: "2024-12-20", isCurrent: false })).toBe("24.07 ~ 24.12");
    expect(formatPeriod({ firstLog: "2024-07-01", lastLog: "2024-07-20", isCurrent: false })).toBe("24.07");
    expect(formatPeriod({ firstLog: null, lastLog: null, isCurrent: false })).toBe("기록 없음");
  });
});

describe("isLoggableDate", () => {
  test("accepts today and past days", () => {
    expect(isLoggableDate("2026-11-10", "2026-11-10")).toBe(true);
    expect(isLoggableDate("2025-01-31", "2026-11-10")).toBe(true);
  });

  test("refuses future days and dates that do not exist", () => {
    expect(isLoggableDate("2026-11-11", "2026-11-10")).toBe(false);
    expect(isLoggableDate("2026-02-30", "2026-11-10")).toBe(false);
    expect(isLoggableDate("20261110", "2026-11-10")).toBe(false);
  });
});
