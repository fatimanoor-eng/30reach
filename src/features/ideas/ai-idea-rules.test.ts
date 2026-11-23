import { describe, expect, it } from "vitest";
import {
  aiSourceLabel,
  aiSuggestion,
  formatLabel,
  likesWord,
  planOnLabel,
  suggestedDay,
} from "./idea-rules";

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

describe("AI idea suggestion line + one-click plan", () => {
  const idea = (o: Record<string, unknown> = {}) => ({
    kind: "ai" as const,
    planned_card_id: null,
    platform: "tiktok" as const,
    format: "video",
    source_snapshot: { saved_from: "plan", suggested_date: "2026-12-31" },
    ...o,
  });

  it("'Suggested: Thu 31 Dec · TT Video' with a day to plan on", () => {
    expect(aiSuggestion(idea(), "2026-11-19")).toEqual({
      label: "Suggested: Thu 31 Dec · TT Video",
      day: "2026-12-31",
    });
    expect(planOnLabel("2026-12-31")).toBe("Plan on Thu 31 Dec");
  });

  it("today still counts; a passed day says so and has no one-click plan", () => {
    expect(aiSuggestion(idea(), "2026-12-31")?.day).toBe("2026-12-31");
    expect(aiSuggestion(idea(), "2027-01-01")).toEqual({
      label: "Suggested: Thu 31 Dec · TT Video (passed)",
      day: null,
    });
  });

  it("without platform / format: just the day", () => {
    expect(aiSuggestion(idea({ platform: null, format: null }), "2026-11-19")?.label).toBe(
      "Suggested: Thu 31 Dec",
    );
    expect(aiSuggestion(idea({ platform: "instagram", format: null }), "2026-11-19")?.label).toBe(
      "Suggested: Thu 31 Dec · IG",
    );
  });

  it("nothing for planned ideas, other kinds, Ask Blip ideas or bad dates", () => {
    expect(aiSuggestion(idea({ planned_card_id: "card-1" }), "2026-11-19")).toBeNull();
    expect(aiSuggestion(idea({ kind: "note" }), "2026-11-19")).toBeNull();
    expect(
      aiSuggestion(idea({ source_snapshot: { saved_from: "ask-blip" } }), "2026-11-19"),
    ).toBeNull();
    expect(
      aiSuggestion(idea({ source_snapshot: { suggested_date: "31/12/2026" } }), "2026-11-19"),
    ).toBeNull();
  });
});

describe("LinkedIn ideas (Slice 15c)", () => {
  it("suggestion line says LI and the format's name", () => {
    expect(
      aiSuggestion(
        {
          kind: "ai",
          planned_card_id: null,
          platform: "linkedin",
          format: "article",
          source_snapshot: { saved_from: "plan", suggested_date: "2026-12-31" },
        },
        "2026-11-19",
      )?.label,
    ).toBe("Suggested: Thu 31 Dec · LI Link");
  });
  it("names LinkedIn formats and calls likes reactions", () => {
    expect(["text", "document", "article", "poll"].map(formatLabel)).toEqual([
      "Text",
      "Document",
      "Link",
      "Poll",
    ]);
    expect(likesWord("linkedin")).toBe("reactions");
    expect(likesWord("instagram")).toBe("likes");
    expect(likesWord(null)).toBe("likes");
  });
});
