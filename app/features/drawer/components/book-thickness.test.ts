import { expect, test } from "vitest";

import { bookThickness } from "./BookCover";

test("book thickness grows with logs but stays within 10–34px", () => {
  expect(bookThickness(0)).toBe(10);
  expect(bookThickness(10)).toBe(18);
  expect(bookThickness(30)).toBe(34);
  expect(bookThickness(10_000)).toBe(34);
  expect(bookThickness(-5)).toBe(10);
});
