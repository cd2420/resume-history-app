import { expect, test } from "vitest";

import { isUnlimited, parseRole } from "./roles";

test("only an exact 'admin' value is an admin; everything else fails closed to user", () => {
  expect(parseRole("admin")).toBe("admin");
  for (const value of ["Admin", "admin ", "root", "", null, undefined, 1, { role: "admin" }]) {
    expect(parseRole(value)).toBe("user");
  }
  expect(isUnlimited("admin")).toBe(true);
  expect(isUnlimited("user")).toBe(false);
});
