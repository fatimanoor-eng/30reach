import { describe, expect, it } from "vitest";
import {
  brandFollowers,
  engagementRate,
  followerTable,
  formatDelta,
  formatFollowers,
  formatRate,
  type FollowerTask,
} from "./followers";
import type { OverviewPost } from "./metrics";

const t = (
  competitor_id: string,
  platform: FollowerTask["platform"],
  followers: number | null,
  error_code: string | null = null,
): FollowerTask => ({ competitor_id, platform, followers, error_code });

const latest = [
  t("hims", "instagram", 412_000),
  t("hims", "tiktok", 120_000),
  t("hims", "facebook", 90_000),
  t("ro", "instagram", 50_000, "carried"),
  t("ro", "tiktok", null),
];
const previous = [
  t("hims", "instagram", 408_800),
  t("hims", "tiktok", 121_100),
  t("hims", "facebook", 89_000),
  t("ro", "instagram", 49_000),
  t("ro", "tiktok", 10_000),
];
const table = followerTable(latest, previous);

describe("followers", () => {
  it("growth only when both pulls really read the number", () => {
    expect(brandFollowers(table, "hims", "instagram")).toEqual({ count: 412_000, delta: 3_200 });
    expect(brandFollowers(table, "hims", "tiktok")).toEqual({ count: 120_000, delta: -1_100 });
    // Facebook's count is read when the page is saved, not per pull: no growth.
    expect(brandFollowers(table, "hims", "facebook")).toEqual({ count: 90_000, delta: null });
    // Carried over from the earlier pull: the count shows, growth doesn't.
    expect(brandFollowers(table, "ro", "instagram")).toEqual({ count: 50_000, delta: null });
    expect(brandFollowers(table, "ro", "tiktok")).toEqual({ count: null, delta: null });
    expect(brandFollowers(table, "nobody", "x")).toEqual({ count: null, delta: null });
  });

  it("All = the sum over platforms with a count", () => {
    expect(brandFollowers(table, "hims", "all")).toEqual({ count: 622_000, delta: 2_100 });
    expect(brandFollowers(table, "ro", "all")).toEqual({ count: 50_000, delta: null });
  });

  it("no previous pull: counts, no growth", () => {
    expect(brandFollowers(followerTable(latest), "hims", "instagram").delta).toBeNull();
  });

  it("engagement rate = each post's engagement ÷ that platform's followers, averaged", () => {
    const post = (id: string, platform: OverviewPost["platform"], likes: number, hidden = false) =>
      ({
        id,
        competitor_id: "hims",
        platform,
        likes,
        comments: 0,
        counts_hidden: hidden,
      }) as OverviewPost;
    const posts = [
      post("a", "instagram", 4_120), // 1%
      post("b", "tiktok", 3_600), // 3%
      post("c", "x", 999), // no X count: left out
      post("d", "instagram", 99_999, true), // counts hidden: left out
    ];
    expect(engagementRate(posts, table, "hims")).toBeCloseTo(0.02);
    expect(engagementRate(posts, table, "ro")).toBeNull();
  });

  it("formats", () => {
    expect(formatRate(0.024)).toBe("2.4%");
    expect(formatRate(0.0035)).toBe("0.35%");
    expect(formatRate(0.00001)).toBe("<0.01%");
    expect(formatRate(null)).toBe("—");
    expect(formatFollowers(412_000)).toBe("412K");
    expect(formatFollowers(null)).toBe("—");
    expect(formatDelta(3_200)).toBe("+3.2K");
    expect(formatDelta(-1_100)).toBe("−1.1K");
    expect(formatDelta(0)).toBeNull();
  });
});
