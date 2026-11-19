import { describe, expect, it } from "vitest";
import type { PlanSuggestion } from "../../lib/ai/ai-api";
import {
  factChips,
  ideaFromSuggestion,
  PLAN_LINE_MS,
  planEvents,
  planLoadingLines,
  planTarget,
} from "./plan-month";

describe("planTarget: the month after the one in focus", () => {
  it("plans next month from today's month", () => {
    expect(planTarget("2026-11-18", "2026-11-18")).toEqual({
      month: "2026-12",
      first: "2026-12-01",
      enabled: true,
      reason: null,
    });
  });

  it("rolls over the year", () => {
    expect(planTarget("2026-12-05", "2026-11-18").month).toBe("2027-01");
  });

  it("allows up to 3 months ahead, not past months", () => {
    expect(planTarget("2027-01-10", "2026-11-18")).toMatchObject({
      month: "2027-02",
      enabled: true,
    });
    expect(planTarget("2027-02-10", "2026-11-18")).toMatchObject({
      month: "2027-03",
      enabled: false,
      reason: "Blip plans up to 3 months ahead",
    });
    expect(planTarget("2026-09-10", "2026-11-18")).toMatchObject({
      month: "2026-10",
      enabled: false,
      reason: "That month has passed",
    });
  });
});

describe("planEvents: code rules + Nager, never AI", () => {
  it("lists January's events, with Resolution season dated inside the month", () => {
    const holidays = new Map([
      [
        2027,
        [
          {
            date: "2027-01-01",
            localName: "New Year's Day",
            name: "New Year's Day",
            global: true,
            types: ["Public"],
          },
        ],
      ],
    ]);
    const events = planEvents("2027-01", holidays as never);
    expect(events.every((e) => e.date.startsWith("2027-01-"))).toBe(true);
    expect(events.find((e) => e.name.includes("Resolution"))?.date).toBe("2027-01-01");
    expect(events.some((e) => e.kind === "holiday")).toBe(true);
  });

  it("still has code events when holidays failed to load", () => {
    const events = planEvents("2027-01", new Map());
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === "holiday")).toBe(false);
  });
});

describe("factChips", () => {
  it("reads like the 10 frame", () => {
    expect(
      factChips(
        { events: 4, bestFormat: "Reels", bestTime: "Tue evening", boardIdeas: 2 },
        "January",
      ),
    ).toEqual([
      "4 events in January",
      "Reels win right now",
      "Tue evening works best",
      "2 ideas on your board",
    ]);
  });
  it("leaves out what isn't known", () => {
    expect(
      factChips({ events: 0, bestFormat: null, bestTime: null, boardIdeas: 0 }, "March"),
    ).toEqual(["No events in March"]);
  });
});

describe("ideaFromSuggestion: idea board, never the calendar", () => {
  const s: PlanSuggestion = {
    date: "2027-01-05",
    platform: "tiktok",
    format: "video",
    title: "Clinician answers: is Dry January worth it?",
    reason: "Q&A videos are Hims’ best TikTok format this month.",
    sources: [
      {
        id: "post-1",
        brand: "Hims",
        platform: "tiktok",
        format: "video",
        postedAt: "2026-11-09T22:00:00Z",
        url: "https://x",
        likes: 9800,
        views: 1,
      },
    ],
  };
  it("is an AI idea with the title first, the reason and the suggested day", () => {
    const idea = ideaFromSuggestion(s);
    expect(idea).toMatchObject({
      kind: "ai",
      note: "Clinician answers: is Dry January worth it?\nWhy: Q&A videos are Hims’ best TikTok format this month.",
      platform: "tiktok",
      format: "video",
      source_post_id: "post-1",
      source_snapshot: { saved_from: "plan", suggested_date: "2027-01-05", brand: "Hims" },
    });
  });
});

describe("planLoadingLines: what Blip/Scanning says while planning", () => {
  it("events, competitors, then writing, in turn", () => {
    expect(planLoadingLines("December")).toEqual([
      "Scanning December’s events…",
      "Checking what’s working for competitors…",
      "Writing ideas…",
    ]);
    expect(PLAN_LINE_MS).toBeGreaterThanOrEqual(1500);
  });
});
