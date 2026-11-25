import { describe, expect, it } from "vitest";
import {
  carriedPostRow,
  carriedTaskRow,
  carriedThumbPath,
  carryPlan,
  lastRealCredits,
  pacificDayStart,
} from "./carry-logic.ts";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const prev = { started_at: "2026-11-16T16:20:00Z", carried: {} };
const tracked = ["instagram", "tiktok", "linkedin", "youtube"] as const;

describe("carry-over plan (18b)", () => {
  it("carries the tracked platforms this pull didn't get, from the previous pull", () => {
    expect(
      carryPlan({
        tracked,
        tasks: [
          { platform: "instagram", status: "done" },
          { platform: "instagram", status: "failed" },
        ],
        previous: prev,
        previousPlatforms: ["instagram", "tiktok", "linkedin"],
        nowMs: NOW,
      }),
    ).toEqual([
      { platform: "tiktok", from: "2026-11-16T16:20:00Z" },
      { platform: "linkedin", from: "2026-11-16T16:20:00Z" },
    ]);
  });
  it("a platform whose every task failed (YouTube's daily limit) is carried too", () => {
    expect(
      carryPlan({
        tracked,
        tasks: [
          { platform: "instagram", status: "done" },
          { platform: "youtube", status: "failed" },
        ],
        previous: prev,
        previousPlatforms: ["youtube"],
        nowMs: NOW,
      }),
    ).toEqual([{ platform: "youtube", from: "2026-11-16T16:20:00Z" }]);
  });
  it("a chain of carries keeps the original date; nothing without a previous pull", () => {
    expect(
      carryPlan({
        tracked: ["tiktok"],
        tasks: [],
        previous: { ...prev, carried: { tiktok: "2026-11-02T09:00:00Z" } },
        previousPlatforms: ["tiktok"],
        nowMs: NOW,
      }),
    ).toEqual([{ platform: "tiktok", from: "2026-11-02T09:00:00Z" }]);
    expect(
      carryPlan({ tracked, tasks: [], previous: null, previousPlatforms: [], nowMs: NOW }),
    ).toEqual([]);
  });
  it("YouTube older than 30 days isn't carried (YouTube's policies)", () => {
    expect(
      carryPlan({
        tracked: ["youtube", "tiktok"],
        tasks: [],
        previous: { started_at: "2026-10-20T10:00:00Z", carried: {} },
        previousPlatforms: ["youtube", "tiktok"],
        nowMs: NOW,
      }).map((s) => s.platform),
    ).toEqual(["tiktok"]);
  });
  it("platforms the client doesn't track, or the previous pull didn't have, aren't carried", () => {
    expect(
      carryPlan({
        tracked: ["instagram"],
        tasks: [],
        previous: prev,
        previousPlatforms: ["tiktok"],
        nowMs: NOW,
      }),
    ).toEqual([]);
  });
});

describe("copied rows", () => {
  it("posts: new pull, no id, no thumbnail yet", () => {
    expect(
      carriedPostRow(
        {
          id: "p1",
          pull_id: "old",
          created_at: "x",
          platform: "tiktok",
          likes: 3,
          thumbnail_path: "a",
        },
        "new",
      ),
    ).toEqual({ pull_id: "new", platform: "tiktok", likes: 3, thumbnail_path: null });
  });
  it("tasks: done, marked carried, 0 credits", () => {
    expect(
      carriedTaskRow(
        { competitor_id: "c1", platform: "tiktok", followers: 900, posts_found: 4 },
        "new",
        "2026-11-25T12:00:00Z",
      ),
    ).toEqual({
      pull_id: "new",
      competitor_id: "c1",
      platform: "tiktok",
      status: "done",
      error_code: "carried",
      credits_used: 0,
      pages: 0,
      posts_found: 4,
      followers: 900,
      finished_at: "2026-11-25T12:00:00Z",
    });
  });
  it("thumbnails keep their type", () => {
    expect(carriedThumbPath("cl/old/p1.webp", "cl", "new", "p9")).toBe("cl/new/p9.webp");
    expect(carriedThumbPath("cl/old/p1.jpeg", "cl", "new", "p9")).toBe("cl/new/p9.jpg");
  });
});

describe("estimates read the last real pull of each brand × platform", () => {
  it("skips carried tasks (0 credits) for the pull that really pulled it", () => {
    const m = lastRealCredits([
      {
        tasks: [
          { competitor_id: "c1", platform: "instagram", credits_used: 6, error_code: null },
          { competitor_id: "c1", platform: "tiktok", credits_used: 0, error_code: "carried" },
        ],
      },
      {
        tasks: [
          { competitor_id: "c1", platform: "instagram", credits_used: 8, error_code: null },
          { competitor_id: "c1", platform: "tiktok", credits_used: 4, error_code: null },
        ],
      },
    ]);
    expect(m.get("c1:instagram")).toBe(6);
    expect(m.get("c1:tiktok")).toBe(4);
  });
});

describe("YouTube's day (quota resets at midnight Pacific)", () => {
  it("winter (PST, UTC−8) and summer (PDT, UTC−7)", () => {
    expect(new Date(pacificDayStart(Date.parse("2026-11-25T12:00:00Z"))).toISOString()).toBe(
      "2026-11-25T08:00:00.000Z",
    );
    // 03:00 UTC on 26 Nov is still 25 Nov in California.
    expect(new Date(pacificDayStart(Date.parse("2026-11-26T03:00:00Z"))).toISOString()).toBe(
      "2026-11-25T08:00:00.000Z",
    );
    expect(new Date(pacificDayStart(Date.parse("2026-07-10T12:00:00Z"))).toISOString()).toBe(
      "2026-07-10T07:00:00.000Z",
    );
  });
});
