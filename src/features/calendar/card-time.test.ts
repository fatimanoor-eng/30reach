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

describe("who line and past dates (09)", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  it("new card, then saved", async () => {
    const { whoLine } = await import("./card-time");
    expect(whoLine("Fatima Noor", null, now)).toBe("New card · Fatima Noor");
    expect(whoLine(null, null, now)).toBe("New card");
    expect(whoLine("Fatima Noor", { updatedAt: "2026-11-17T10:00:00Z" }, now)).toBe(
      "Fatima Noor · edited 2 h ago",
    );
  });

  it("flags a past day unless the card is posted", async () => {
    const { pastAndNotPosted } = await import("./card-time");
    expect(pastAndNotPosted("2026-11-10", "2026-11-17", "drafting")).toBe(true);
    expect(pastAndNotPosted("2026-11-10", "2026-11-17", "posted")).toBe(false);
    expect(pastAndNotPosted("2026-11-17", "2026-11-17", "idea")).toBe(false); // today is fine
    expect(pastAndNotPosted("2026-12-01", "2026-11-17", "idea")).toBe(false);
  });
});
