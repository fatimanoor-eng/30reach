import { describe, expect, it } from "vitest";
import us2022 from "./fixtures/us-2022.json";
import us2026 from "./fixtures/us-2026.json";
import { isFresh, parseYear, slimNager } from "./logic";

describe("parseYear", () => {
  it("accepts last year to two years ahead", () => {
    expect(parseYear({ year: 2025 }, 2026)).toBe(2025);
    expect(parseYear({ year: 2028 }, 2026)).toBe(2028);
  });
  it.each([{ year: 2024 }, { year: 2029 }, { year: "2026" }, { year: 2026.5 }, {}])(
    "refuses %o",
    (body) => expect(parseYear(body, 2026)).toBeNull(),
  );
});

describe("slimNager", () => {
  it("keeps date, name and global from a real response", () => {
    const rows = slimNager(us2026, 2026)!;
    expect(rows).toHaveLength(us2026.length);
    expect(rows[1]).toEqual({
      date: "2026-01-19",
      name: "Martin Luther King, Jr. Day",
      global: true,
    });
    expect(rows.find((r) => r.name === "Lincoln's Birthday")?.global).toBe(false);
  });
  it("accepts an observed day in the year before", () => {
    expect(slimNager(us2022, 2022)?.[0].date).toBe("2021-12-31");
  });
  it.each([
    ["not a list", { error: "nope" }],
    ["empty list", []],
    ["bad date", [{ date: "4 July", name: "x", global: true }]],
    ["missing name", [{ date: "2026-07-04", global: true }]],
    ["wrong year", [{ date: "2030-07-04", name: "x", global: true }]],
  ])("refuses %s", (_label, body) => expect(slimNager(body, 2026)).toBeNull());
});

describe("isFresh", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  it("is fresh for 90 days", () => {
    expect(isFresh("2026-09-01T00:00:00Z", now)).toBe(true);
    expect(isFresh("2026-08-01T00:00:00Z", now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });
});
