import { describe, expect, it } from "vitest";
import type { PullStartResponse } from "../../lib/pulls/api";
import type { TaskProgress } from "../../lib/pulls/run-pull";
import {
  availablePlatforms,
  durationText,
  initialSelection,
  keepsLine,
  onlyYouTubeLimit,
  rowCost,
  YOUTUBE_LIMIT,
  YOUTUBE_LIMIT_ALONE,
  mobileProgressLine,
  noAccountsText,
  otherPullingText,
  possessive,
  problemSentence,
  targetNoun,
  refreshIntro,
  selectionCost,
  tookLabel,
} from "./pull-text";

const task = (
  platform: TaskProgress["platform"],
  status: TaskProgress["status"],
): TaskProgress => ({
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

  it("18b: everything ticked when it fits; otherwise as many as fit, in the usual order", () => {
    expect(initialSelection(preview(588))).toEqual(["instagram", "tiktok"]);
    expect(initialSelection(preview(64))).toEqual(["instagram"]); // 48 fits, 48 + 48 doesn't
    expect(initialSelection(preview(40))).toEqual([]);
    const withYt = (left: number, limit = false): PullStartResponse => ({
      ...preview(left),
      youtubeLimitToday: limit,
      estimate: {
        ...preview(left).estimate,
        perPlatform: {
          ...preview(left).estimate.perPlatform,
          youtube: { tasks: 3, expected: 0, max: 0 },
        },
      },
    });
    // YouTube is free, so it always fits; unticked when today's limit already ran out.
    expect(initialSelection(withYt(10))).toEqual(["youtube"]);
    expect(initialSelection(withYt(588, true))).toEqual(["instagram", "tiktok"]);
  });

  it("row costs and the line under an unticked platform", () => {
    expect(rowCost(preview(588), "instagram")).toBe("~36 credits");
    expect(rowCost(preview(588), "youtube")).toBe("free (Google’s daily allowance)");
    expect(keepsLine("2026-11-16T16:20:00Z")).toBe("Keeps the 16 Nov data");
    expect(keepsLine(null)).toBe("Not pulled this time");
  });

  it("intro mentions the pull it replaces", () => {
    expect(refreshIntro(preview(588, "2026-11-06T10:00:00Z"))).toBe(
      "This pulls the latest public posts for 6 brands and replaces the saved pull from 6 Nov. Platforms you untick keep their last data.",
    );
    expect(refreshIntro(preview(588))).toBe(
      "This pulls the latest public posts for 6 brands from the last 30 days.",
    );
  });
});

describe("durationText", () => {
  it("estimates from expected pages at ~13 s each", () => {
    expect(durationText(60)).toBe("about 7 minutes"); // 30 pages
    expect(durationText(4)).toBe("about 1 minute"); // test pull
  });
});

describe("tookLabel (pull-complete toast)", () => {
  it("seconds, minutes, hours", () => {
    expect(tookLabel(800)).toBe("in 1 s");
    expect(tookLabel(45_000)).toBe("in 45 s");
    expect(tookLabel(170_000)).toBe("in 3 min");
    expect(tookLabel(65 * 60_000)).toBe("in 1 h 5 min");
    expect(tookLabel(120 * 60_000)).toBe("in 2 h");
  });
});

describe("LinkedIn (Slice 15a)", () => {
  it("a missing LinkedIn page is a page, not a handle", () => {
    expect(problemSentence([{ brand: "Ro", platform: "linkedin", code: "not_found" }])).toBe(
      "Ro’s LinkedIn page wasn’t found.",
    );
  });
  it("LinkedIn row in the confirm dialog and its cost", () => {
    const p = preview(500);
    p.estimate.perPlatform.linkedin = { tasks: 6, expected: 12, max: 24 };
    expect(availablePlatforms(p)).toEqual(["instagram", "tiktok", "linkedin"]);
    expect(selectionCost(p, ["linkedin"])).toEqual({ expected: 12, max: 24 });
  });
  it("an estimate without a linkedin entry (pull-start not redeployed yet) still works", () => {
    expect(availablePlatforms(preview(500))).toEqual(["instagram", "tiktok"]);
    expect(selectionCost(preview(500), ["linkedin"])).toEqual({ expected: 0, max: 0 });
  });
  it("progress line includes LinkedIn", () => {
    expect(mobileProgressLine([task("instagram", "done"), task("linkedin", "queued")])).toBe(
      "Instagram done · LinkedIn waiting",
    );
  });
});

describe("Facebook (Slice 16a)", () => {
  it("a missing Facebook page is a page, not a handle", () => {
    expect(
      problemSentence([{ brand: "WeightWatchers", platform: "facebook", code: "not_found" }]),
    ).toBe("WeightWatchers’ Facebook page wasn’t found.");
    expect(targetNoun("facebook")).toBe("page");
    expect(targetNoun("tiktok")).toBe("handle");
  });
  it("Facebook row in the confirm dialog and its cost", () => {
    const p = preview(500);
    p.estimate.perPlatform.facebook = { tasks: 6, expected: 24, max: 48 };
    expect(availablePlatforms(p)).toEqual(["instagram", "tiktok", "facebook"]);
    expect(selectionCost(p, ["facebook"])).toEqual({ expected: 24, max: 48 });
  });
  it("an estimate without a facebook entry (pull-start not redeployed yet) still works", () => {
    expect(selectionCost(preview(500), ["facebook"])).toEqual({ expected: 0, max: 0 });
  });
  it("progress line includes Facebook", () => {
    expect(mobileProgressLine([task("linkedin", "done"), task("facebook", "queued")])).toBe(
      "LinkedIn done · Facebook waiting",
    );
  });
});

describe("one pull at a time across clients (Slice 17a)", () => {
  it("says who is pulling", () => {
    expect(otherPullingText("OBU Health")).toBe(
      "OBU Health is pulling right now. Try again in a few minutes.",
    );
  });
});

describe("noAccountsText (Slice 17c fix)", () => {
  it("names the client", () => {
    expect(noAccountsText("Acme Studio")).toBe(
      "Acme Studio has no competitors with accounts yet. Add one to run a pull.",
    );
  });
});

describe("YouTube (Slice 18)", () => {
  it("the daily quota running out is said once, plainly", () => {
    expect(
      problemSentence([
        { brand: "Ro", platform: "youtube", code: "quota" },
        { brand: "Hims", platform: "youtube", code: "quota" },
      ]),
    ).toBe(YOUTUBE_LIMIT);
    expect(YOUTUBE_LIMIT).toBe(
      "YouTube’s free daily limit ran out. The other platforms were pulled. YouTube will work again tomorrow.",
    );
    // Only YouTube was tried (the pull failed): no "other platforms".
    expect(
      problemSentence([{ brand: "Ro", platform: "youtube", code: "quota" }], {
        othersPulled: false,
      }),
    ).toBe(YOUTUBE_LIMIT_ALONE);
    // The limit first, then the other problems.
    expect(
      problemSentence([
        { brand: "Ro", platform: "youtube", code: "quota" },
        { brand: "Found", platform: "tiktok", code: "not_found" },
      ]),
    ).toBe(`${YOUTUBE_LIMIT} Found’s TikTok handle wasn’t found.`);
    expect(onlyYouTubeLimit([{ brand: "Ro", platform: "youtube", code: "quota" }])).toBe(true);
    expect(problemSentence([{ brand: "Ro", platform: "youtube", code: "not_found" }])).toBe(
      "Ro’s YouTube handle wasn’t found.",
    );
  });
});
