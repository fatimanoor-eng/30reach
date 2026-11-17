import { describe, expect, it } from "vitest";
import {
  bestFormat,
  bestTime,
  type BrandRef,
  filterPosts,
  type Filters,
  isStale,
  kpis,
  leaderboard,
  type OverviewPost,
  postStats,
  slotLabel,
  topPosts,
  whatsNew,
} from "./metrics";

const PULL = "2026-11-17T20:00:00Z";
const brands: BrandRef[] = [
  { id: "hims", name: "Hims", initials: "Hi" },
  { id: "hers", name: "Hers", initials: "He" },
  { id: "ro", name: "Ro", initials: "Ro" },
];
let n = 0;
const post = (o: Partial<OverviewPost>): OverviewPost => ({
  id: `p${++n}`,
  competitor_id: "hims",
  platform: "instagram",
  external_id: `x${n}`,
  url: "https://example.com",
  posted_at: "2026-11-10T23:30:00Z", // Tue 10 Nov, 6:30 pm US Eastern
  format: "reel",
  caption: null,
  hashtags: [],
  likes: 100,
  comments: 10,
  views: null,
  counts_hidden: false,
  thumbnail_path: null,
  ...o,
});
const all: Filters = { platform: "both", days: 30, brandIds: [] };

describe("filterPosts", () => {
  const posts = [
    post({ posted_at: "2026-11-15T12:00:00Z" }), // 2 days before the pull
    post({ posted_at: "2026-11-05T12:00:00Z" }), // 12 days before
    post({ posted_at: "2026-10-10T12:00:00Z" }), // outside 30 days
    post({ platform: "tiktok", competitor_id: "ro", posted_at: "2026-11-16T12:00:00Z" }),
  ];
  it("counts back from the pull time", () => {
    expect(filterPosts(posts, all, PULL)).toHaveLength(3);
    expect(filterPosts(posts, { ...all, days: 7 }, PULL)).toHaveLength(2);
  });
  it("filters platform and brands", () => {
    expect(filterPosts(posts, { ...all, platform: "tiktok" }, PULL)).toHaveLength(1);
    expect(filterPosts(posts, { ...all, brandIds: ["ro"] }, PULL)).toHaveLength(1);
  });
});

describe("leaderboard", () => {
  const posts = [
    post({ competitor_id: "hims", likes: 300, comments: 0 }),
    post({ competitor_id: "hims", likes: 100, comments: 0 }),
    post({ competitor_id: "hers", likes: 50, comments: 50 }),
    post({ competitor_id: "hers", likes: 9999, comments: 9999, counts_hidden: true }), // ignored in averages
  ];
  const rows = leaderboard(posts, brands);

  it("sorts by avg engagement, shares add up, brands without posts last", () => {
    expect(rows.map((r) => [r.brand.name, r.rank])).toEqual([
      ["Hims", 1],
      ["Hers", 2],
      ["Ro", 3],
    ]);
    expect(rows[0]).toMatchObject({ posts: 2, avgLikes: 200, avgComments: 0, avgEngagement: 200 });
    expect(rows[1]).toMatchObject({ posts: 2, avgEngagement: 100 }); // hidden post counted, not averaged
    expect(rows[0].share + rows[1].share).toBeCloseTo(1);
    expect(rows[2]).toMatchObject({ posts: 0, share: 0 });
  });
});

describe("KPIs", () => {
  it("best format compares best vs weakest (≥ 2 posts each)", () => {
    const posts = [
      post({ format: "reel", likes: 200 }),
      post({ format: "reel", likes: 220 }),
      post({ format: "image", likes: 90 }),
      post({ format: "image", likes: 90 }),
      post({ format: "carousel", likes: 5000 }), // only one carousel → not considered
    ];
    expect(bestFormat(posts)).toEqual({
      label: "Best format",
      value: "Reels",
      caption: "2.2× the engagement of single images", // (210+230)/2 vs 100
    });
  });

  it("best time: 2-hour slot in US Eastern, needs ≥ 2 posts", () => {
    const posts = [
      post({ posted_at: "2026-11-10T23:30:00Z", likes: 500 }), // Tue 6:30 pm ET
      post({ posted_at: "2026-11-10T23:50:00Z", likes: 400 }), // Tue 6:50 pm ET
      post({ posted_at: "2026-11-12T15:00:00Z", likes: 9000 }), // Thu 10 am — single post, ignored
    ];
    expect(bestTime(posts).value).toBe("Tue 6–8 pm");
    expect(slotLabel("Sat", 10)).toBe("Sat 10 am–12 pm");
    expect(slotLabel("Mon", 22)).toBe("Mon 10 pm–12 am");
  });

  it("all brands: combined + Most active; one brand: Posting rate", () => {
    const posts = [
      post({ competitor_id: "hims" }),
      post({ competitor_id: "hims" }),
      post({ competitor_id: "hers" }),
    ];
    const [tracked, , activity] = kpis(posts, brands, all);
    expect(tracked).toMatchObject({ value: "3", caption: "Across 3 brands, both platforms" });
    expect(activity).toMatchObject({
      label: "Most active",
      value: "Hims",
      caption: "2 posts, about 0.1 a day",
    });

    const one = kpis(posts.slice(0, 2), brands, { ...all, days: 7, brandIds: ["hims"] });
    expect(one[0].caption).toBe("Hims, both platforms");
    expect(one[2]).toEqual({
      label: "Posting rate",
      value: "0.3 a day",
      caption: "2 posts in 7 days",
    });

    const two = kpis(posts, brands, { ...all, platform: "instagram", brandIds: ["hims", "hers"] });
    expect(two[0].caption).toBe("Across 2 brands, Instagram");
  });
});

describe("top posts and stats", () => {
  it("ranks by likes + comments, not views", () => {
    const posts = [
      post({ id: "a", likes: 100, comments: 0 }),
      post({ id: "b", platform: "tiktok", likes: 50, comments: 10, views: 900_000 }),
      post({ id: "c", likes: 500, comments: 5 }),
    ];
    expect(topPosts(posts, 2).map((p) => p.id)).toEqual(["c", "a"]);
  });
  it("formats stats per platform", () => {
    expect(postStats(post({ likes: 18_412, comments: 1102 }))).toBe("18.4K likes · 1.1K comments");
    expect(postStats(post({ platform: "tiktok", views: 212_000, likes: 9800 }))).toBe(
      "212K views · 9.8K likes",
    );
    expect(postStats(post({ likes: 1, comments: 1 }))).toBe("1 like · 1 comment");
  });
});

describe("stale data", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  it("is stale after more than 7 days", () => {
    expect(isStale("2026-11-10T13:00:00Z", now)).toBe(false); // 6.96 days
    expect(isStale("2026-11-07T12:00:00Z", now)).toBe(true); // 10 days
  });
});

describe("whatsNew (05e)", () => {
  const PREV = "2026-11-06T20:00:00Z";
  const previous = [
    post({
      competitor_id: "hers",
      external_id: "old1",
      likes: 900,
      posted_at: "2026-11-01T12:00:00Z",
    }),
    post({
      competitor_id: "hims",
      external_id: "old2",
      likes: 100,
      posted_at: "2026-11-02T12:00:00Z",
      hashtags: ["glp1"],
    }),
  ];
  const latest = [
    post({
      competitor_id: "hers",
      external_id: "old1",
      likes: 900,
      posted_at: "2026-11-01T12:00:00Z",
    }),
    post({
      id: "n1",
      competitor_id: "hims",
      external_id: "new1",
      likes: 5000,
      posted_at: "2026-11-14T12:00:00Z",
      hashtags: ["dryjanuary", "glp1"],
    }),
    post({
      id: "n2",
      competitor_id: "hims",
      external_id: "new2",
      likes: 4000,
      posted_at: "2026-11-15T12:00:00Z",
      hashtags: ["dryjanuary"],
    }),
  ];
  const w = whatsNew(latest, previous, all, PULL, PREV, brands);

  it("finds new posts, the brand that moved to #1, and the new tag", () => {
    expect(w.newCount).toBe(2);
    expect([...w.newPostIds].sort()).toEqual(["n1", "n2"]);
    expect(w.rankDelta.get("hims")).toBe(1);
    expect(w.rankDelta.get("hers")).toBe(-1);
    expect(w.summary).toEqual(["2 new posts", "Hims moved up to #1", "new tag #dryjanuary"]);
  });
});
