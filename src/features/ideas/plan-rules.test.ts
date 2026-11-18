import { describe, expect, it } from "vitest";
import us2026 from "../../../supabase/functions/holidays/fixtures/us-2026.json";
import type { HolidayRow } from "../calendar/events";
import { eventStarts } from "./plan-rules";

const holidays = new Map([[2026, us2026 as HolidayRow[]]]);

describe("eventStarts (14d yellow dots)", () => {
  const jan = eventStarts(2026, 0, holidays);

  it("dots holidays on their day", () => {
    expect(jan.get("2026-01-01")).toContain("New Year's Day");
    expect(jan.get("2026-01-19")).toContain("Martin Luther King, Jr. Day");
  });

  it("gives no dot for an event that started last month", () => {
    // Resolution season runs 26 Dec 2025 → 15 Jan 2026: no dot anywhere in January for it.
    for (const names of jan.values()) expect(names).not.toContain("Resolution season");
  });

  it("only returns days in that month", () => {
    for (const day of jan.keys()) expect(day.startsWith("2026-01-")).toBe(true);
  });

  it("still works without holidays (marketing and health dates only)", () => {
    const dec = eventStarts(2026, 11, new Map());
    expect(dec.get("2026-12-24")).toContain("Christmas Eve");
    expect([...dec.values()].flat()).not.toContain("Christmas Day");
  });
});
