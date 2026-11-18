import { describe, expect, it } from "vitest";
import { dateRelation, editedAgo } from "./card-time";

describe("editedAgo", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  it.each([
    ["2026-11-18T11:59:40Z", "edited just now"],
    ["2026-11-18T11:55:00Z", "edited 5 min ago"],
    ["2026-11-18T10:00:00Z", "edited 2 h ago"],
    ["2026-11-17T11:00:00Z", "edited 1 day ago"],
    ["2026-11-15T12:00:00Z", "edited 3 days ago"],
    ["2026-11-02T12:00:00Z", "edited 2 Nov"],
    ["2025-11-02T12:00:00Z", "edited 2 Nov 2025"],
    ["2026-11-18T12:05:00Z", "edited just now"], // a clock a little ahead never says "in"
    ["not a date", ""],
  ])("%s → %s", (at, expected) => {
    expect(editedAgo(at, now)).toBe(expected);
  });
});

describe("dateRelation", () => {
  it.each([
    ["2026-11-18", "today"],
    ["2026-11-19", "in 1 day"],
    ["2026-12-04", "in 16 days"],
    ["2026-11-17", "1 day ago"],
    ["2026-11-01", "17 days ago"],
    ["2027-01-01", "in 44 days"], // across the year
  ])("%s → %s", (day, expected) => {
    expect(dateRelation(day, "2026-11-18")).toBe(expected);
  });
});
