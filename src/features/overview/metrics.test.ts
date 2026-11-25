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
  formatName,
  postStats,
  slotLabel,
  slotShort,
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
  shares: null,
  counts_hidden: false,
  thumbnail_path: null,
  ...o,
});
const all: Filters = { platform: "all", days: 30, brandIds: [] };

describe("filterPosts", () => {
  const posts = [
    post({ posted_at: "2026-11-15T12:00:00Z" }), // 2 days before the pull
    post({ posted_at: "2026-11-05T12:00:00Z" }), // 12 days before
    post({ posted_at: "2026-10-10T12:00:00Z" }), // outside 30 days
    post({ platform: "tiktok", competitor_id: "ro", posted_at: "2026-11-16T12:00:00Z" }),
    post({ platform: "linkedin", competitor_id: "hers", posted_at: "2026-11-14T12:00:00Z" }),
  ];
  it("counts back from the pull time; All includes LinkedIn", () => {
    expect(filterPosts(posts, all, PULL)).toHaveLength(4);
    expect(filterPosts(posts, { ...all, days: 7 }, PULL)).toHaveLength(3);
  });
  it("filters platform and brands", () => {
    expect(filterPosts(posts, { ...all, platform: "tiktok" }, PULL)).toHaveLength(1);
    expect(filterPosts(posts, { ...all, platform: "linkedin" }, PULL)).toHaveLength(1);
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
    expect(rows[2]).toMatchObject({ posts: 0, share: 0, smallSample: false });
    expect(rows[0].smallSample).toBe(true); // 2 posts < 10
  });
});

describe("KPIs", () => {
  it("best format compares formats with ≥ 3 posts only", () => {
    const posts = [
      ...[200, 220, 240].map((likes) => post({ format: "reel", likes })), // avg 230
      ...[90, 90, 90].map((likes) => post({ format: "image", likes })), // avg 100
      post({ format: "carousel", likes: 5000 }), // 2 carousels → too few, ignored
      post({ format: "carousel", likes: 5000 }),
    ];
    expect(bestFormat(posts)).toEqual({
      label: "Best format",
      value: "Reels",
      caption: "2.3× the engagement of single images",
    });
  });

  it("only one format with ≥ 3 posts → compared with the other formats' average", () => {
    const posts = [
      ...[200, 220, 240].map((likes) => post({ format: "reel", likes })), // avg 230
      post({ format: "image", likes: 40 }),
      post({ format: "carousel", likes: 90 }),
      post({ format: "video", likes: 70 }), // others avg (50+100+80)/3 = 76.7
    ];
    expect(bestFormat(posts).caption).toBe("3× the engagement of other formats");
  });

  it("too few posts to compare → no ratio; none with ≥ 3 → not enough", () => {
    const three = [200, 220, 240].map((likes) => post({ format: "reel", likes }));
    expect(bestFormat([...three, post({ format: "image" })]).caption).toBe("Based on 3 posts");
    expect(bestFormat([post({ format: "image" }), post({ format: "image" })]).value).toBe("—");
  });

  it("best time: 2-hour slot in US Eastern, needs ≥ 2 posts", () => {
    const posts = [
      post({ posted_at: "2026-11-10T23:30:00Z", likes: 500 }), // Tue 6:30 pm ET
      post({ posted_at: "2026-11-10T23:50:00Z", likes: 400 }), // Tue 6:50 pm ET
      post({ posted_at: "2026-11-12T15:00:00Z", likes: 9000 }), // Thu 10 am — single post, ignored
    ];
    expect(bestTime(posts)).toMatchObject({
      value: "Tue 6–8",
      caption: "pm · US Eastern",
      mobileSuffix: "pm",
    });
    expect(slotLabel("Sat", 10)).toBe("Sat 10 am–12 pm");
    expect(slotLabel("Mon", 22)).toBe("Mon 10 pm–12 am");
    expect(slotShort("Mon", 10)).toEqual({ value: "Mon 10–12", meridiem: "am" });
  });

  it("all brands: combined + Most active; one brand: Posting rate", () => {
    const posts = [
      post({ competitor_id: "hims" }),
      post({ competitor_id: "hims" }),
      post({ competitor_id: "hers" }),
    ];
    const [tracked, , activity] = kpis(posts, brands, all);
    expect(tracked).toMatchObject({ value: "3", caption: "Across 3 brands, all platforms" });
    expect(activity).toMatchObject({
      label: "Most active",
      value: "Hims",
      caption: "2 posts, about 0.1 a day",
    });

    const one = kpis(posts.slice(0, 2), brands, { ...all, days: 7, brandIds: ["hims"] });
    expect(one[0].caption).toBe("Hims, all platforms");
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
    // X (17g): views · likes · replies · reposts (reposts + quotes).
    expect(
      postStats(post({ platform: "x", views: 4100, likes: 120, comments: 8, shares: 1 })),
    ).toBe("4.1K\u00a0views · 120\u00a0likes · 8\u00a0replies · 1\u00a0repost");
    expect(postStats(post({ platform: "linkedin", likes: 1240, comments: 48, shares: 12 }))).toBe(
      "1.2K\u00a0reactions · 48\u00a0comments · 12\u00a0reposts",
    );
    expect(postStats(post({ platform: "linkedin", likes: 1, comments: 0, shares: 1 }))).toBe(
      "1\u00a0reaction · 0\u00a0comments · 1\u00a0repost",
    );
  });
  it("LinkedIn reposts never change the order", () => {
    const posts = [
      post({ id: "a", platform: "linkedin", likes: 100, comments: 0, shares: 5000 }),
      post({ id: "b", platform: "linkedin", likes: 200, comments: 0, shares: 0 }),
    ];
    expect(topPosts(posts, 2).map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("LinkedIn formats", () => {
  it('names the new formats; LinkedIn-only images are "Images"', () => {
    const li = (format: OverviewPost["format"], likes = 100) =>
      post({ platform: "linkedin", format, likes });
    const k = bestFormat([
      ...[1, 2, 3].map(() => li("document", 900)),
      ...[1, 2, 3].map(() => li("text")),
    ]);
    expect([k.value, k.caption]).toEqual(["Documents", "8.3× the engagement of text posts"]);
    expect(bestFormat([1, 2, 3].map(() => li("image"))).value).toBe("Images");
    expect(bestFormat([1, 2, 3].map(() => li("article"))).value).toBe("Links");
    expect(bestFormat([1, 2, 3].map(() => li("poll"))).value).toBe("Polls");
    // Mixed with Instagram images: the Instagram name stays.
    expect(
      bestFormat([li("image"), post({ format: "image" }), post({ format: "image" })]).value,
    ).toBe("Single images");
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

describe("Facebook (Slice 16b)", () => {
  it("post stats: views on videos / reels only, then reactions, comments, shares (kept together)", () => {
    const nb = "\u00a0";
    expect(
      postStats(
        post({
          platform: "facebook",
          format: "reel",
          views: 2771,
          likes: 12,
          comments: 3,
          shares: 3,
        }),
      ),
    ).toBe(`2.8K${nb}views · 12${nb}reactions · 3${nb}comments · 3${nb}shares`);
    expect(
      postStats(
        post({
          platform: "facebook",
          format: "article",
          views: null,
          likes: 1,
          comments: 0,
          shares: 4,
        }),
      ),
    ).toBe(`1${nb}reaction · 0${nb}comments · 4${nb}shares`);
  });
  it("albums: a group of only Facebook carousels is Albums; mixed stays Carousels", () => {
    const fb = post({ platform: "facebook", format: "carousel" });
    expect(formatName("carousel", [fb])).toBe("Albums");
    expect(formatName("carousel", [fb, post({ platform: "instagram", format: "carousel" })])).toBe(
      "Carousels",
    );
  });
});
