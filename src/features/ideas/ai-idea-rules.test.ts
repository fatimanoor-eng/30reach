import { describe, expect, it } from "vitest";
import { aiSourceLabel, suggestedDay } from "./idea-rules";

describe("AI ideas (Slice 11)", () => {
  it("says where an AI idea came from", () => {
    expect(aiSourceLabel({ saved_from: "plan", suggested_date: "2027-01-05" })).toBe(
      "FROM PLAN JANUARY",
    );
    expect(aiSourceLabel({ saved_from: "ask-blip" })).toBe("FROM ASK BLIP");
    expect(aiSourceLabel(null)).toBe("FROM ASK BLIP");
  });

  it("Plan it starts on the suggested day unless it has passed", () => {
    expect(suggestedDay({ suggested_date: "2027-01-05" }, "2026-11-18")).toBe("2027-01-05");
    expect(suggestedDay({ suggested_date: "2026-11-18" }, "2026-11-18")).toBe("2026-11-18");
    expect(suggestedDay({ suggested_date: "2026-11-01" }, "2026-11-18")).toBeNull();
    expect(suggestedDay({ suggested_date: "soon" }, "2026-11-18")).toBeNull();
    expect(suggestedDay(null, "2026-11-18")).toBeNull();
  });
});
