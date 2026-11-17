import { describe, expect, it } from "vitest";
import type { PullStartResponse } from "../../lib/pulls/api";
import type { TaskProgress } from "../../lib/pulls/run-pull";
import {
  fittingPlatforms,
  mobileProgressLine,
  possessive,
  problemSentence,
  refreshIntro,
  selectionCost,
} from "./pull-text";

const task = (platform: "instagram" | "tiktok", status: TaskProgress["status"]): TaskProgress => ({
  id: Math.random().toString(36),
  brand: "B",
  platform,
  status,
  pages: 0,
  postsFound: 0,
  creditsUsed: 0,
  errorCode: null,
});

const preview = (remaining: number, lastPullAt: string | null = null): PullStartResponse => ({
  status: "preview",
  estimate: {
    perPlatform: {
      instagram: { tasks: 6, expected: 36, max: 48 },
      tiktok: { tasks: 6, expected: 24, max: 48 },
    },
    expected: 60,
    max: 96,
  },
  credits: { remaining, plan: 1000, periodStart: null, resetsAt: "2026-12-01T00:00:00Z" },
  lastPullAt,
  brands: 6,
  pageCap: 4,
  windowDays: 30,
  isTest: false,
});

describe("mobileProgressLine (M04)", () => {
  it("matches the Figma example", () => {
    const tasks = [
      ...Array.from({ length: 6 }, () => task("instagram", "done")),
      ...["done", "done", "failed", "running", "queued", "queued"].map((s) =>
        task("tiktok", s as TaskProgress["status"]),
      ),
    ];
    expect(mobileProgressLine(tasks)).toBe("Instagram done · TikTok 3 of 6 brands");
  });

  it("says waiting before a platform starts", () => {
    expect(mobileProgressLine([task("instagram", "running"), task("tiktok", "queued")])).toBe(
      "Instagram 0 of 1 brand · TikTok waiting",
    );
  });
});

describe("problemSentence (05g)", () => {
  it("not found handle", () => {
    expect(problemSentence([{ brand: "Found", platform: "tiktok", code: "not_found" }])).toBe(
      "Found’s TikTok handle wasn’t found.",
    );
  });
  it("other failures and several problems", () => {
    expect(
      problemSentence([{ brand: "Hims", platform: "instagram", code: "provider_error" }]),
    ).toBe("Hims’ Instagram pull failed.");
    expect(
      problemSentence([
        { brand: "Found", platform: "tiktok", code: "not_found" },
        { brand: "Ro", platform: "instagram", code: "failed" },
      ]),
    ).toBe("Found TikTok and Ro Instagram couldn’t be pulled.");
  });
  it("possessive", () => {
    expect(possessive("Found")).toBe("Found’s");
    expect(possessive("Hers")).toBe("Hers’");
  });
});

describe("costs (05 / 05f)", () => {
  it("adds up the chosen platforms", () => {
    expect(selectionCost(preview(588), ["instagram"])).toEqual({ expected: 36, max: 48 });
    expect(selectionCost(preview(588), ["instagram", "tiktok"])).toEqual({ expected: 60, max: 96 });
  });

  it("offers only platforms that fit what's left", () => {
    expect(fittingPlatforms(preview(64))).toEqual(["instagram", "tiktok"]);
    expect(fittingPlatforms(preview(40))).toEqual([]);
  });

  it("intro mentions the pull it replaces", () => {
    expect(refreshIntro(preview(588, "2026-11-06T10:00:00Z"))).toBe(
      "This pulls the latest public posts for 6 brands and replaces the saved pull from 6 Nov.",
    );
    expect(refreshIntro(preview(588))).toBe(
      "This pulls the latest public posts for 6 brands from the last 30 days.",
    );
  });
});
