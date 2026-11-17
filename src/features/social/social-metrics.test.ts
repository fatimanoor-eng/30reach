import { describe, expect, it } from "vitest";
import type { BrandRef, OverviewPost } from "../overview/metrics";
import {
  dayPartIndex,
  formatsByBrand,
  formatStats,
  hashtagOverlap,
  headToHead,
  heatmap,
  socialKpis,
  topHashtags,
} from "./social-metrics";

const brands: BrandRef[] = [
  { id: "hims", name: "Hims", initials: "Hi" },
  { id: "ro", name: "Ro", initials: "Ro" },
  { id: "hers", name: "Hers", initials: "He" },
];
let n = 0;
const post = (o: Partial<OverviewPost>): OverviewPost => ({
  id: `p${++n}`,
  competitor_id: "hims",
  platform: "instagram",
  external_id: `x${n}`,
  url: "https://example.com",
  posted_at: "2026-11-10T23:30:00Z", // Tue 6:30 pm US Eastern → Tue evening
  format: "reel",
  caption: null,
  hashtags: [],
  likes: 100,
  comments: 0,
  views: null,
  counts_hidden: false,
  thumbnail_path: null,
  ...o,
});

describe("formatStats", () => {
  it("best = highest avg among formats with ≥ 3 posts; small formats can't win", () => {
    const stats = formatStats([
      ...[300, 300, 300].map((likes) => post({ format: "reel", likes })),
      ...[100, 100, 100].map((likes) => post({ format: "carousel", likes })),
      post({ format: "image", likes: 9000 }), // 1 post → not eligible
    ]);
    expect(stats.map((s) => [s.format, s.eligible, s.best])).toEqual([
      ["reel", true, true],
      ["carousel", true, false],
      ["image", false, false],
    ]);
  });
  it("keeps TikTok views per format", () => {
    const [s] = formatStats([
      post({ format: "video", views: 1000 }),
      post({ format: "video", views: 3000 }),
    ]);
    expect(s.avgViews).toBe(2000);
  });
});

describe("topHashtags", () => {
  it("counts posts per tag (once per post)", () => {
    expect(
      topHashtags([
        post({ hashtags: ["glp1", "glp1", "a"] }),
        post({ hashtags: ["glp1"] }),
        post({ hashtags: ["b"] }),
      ]),
    ).toEqual([
      { tag: "glp1", count: 2 },
      { tag: "a", count: 1 },
      { tag: "b", count: 1 },
    ]);
  });
});

describe("heatmap (US Eastern day parts)", () => {
  it("buckets hours into Morn / Midday / Aft / Eve / Night", () => {
    expect([6, 10, 11, 13, 14, 17, 18, 22, 23, 2].map(dayPartIndex)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
  it("strongest cell needs ≥ 2 posts", () => {
    const h = heatmap([
      post({ posted_at: "2026-11-10T23:30:00Z", likes: 500 }), // Tue eve
      post({ posted_at: "2026-11-10T23:45:00Z", likes: 300 }), // Tue eve
      post({ posted_at: "2026-11-12T15:00:00Z", likes: 9000 }), // Thu morn, single post
    ]);
    expect(h.strongest).toMatchObject({ day: "Tue", n: 2, avg: 400 });
    expect(h.strongest!.part.key).toBe("eve");
    expect(h.rows).toHaveLength(7);
    expect(h.rows[0]).toHaveLength(5);
    expect(h.max).toBe(9000);
  });
});

describe("socialKpis", () => {
  const all = [
    ...Array.from({ length: 4 }, () => post({ competitor_id: "hims", likes: 400 })),
    ...Array.from({ length: 3 }, () => post({ competitor_id: "ro", likes: 900 })),
  ];
  it("all brands", () => {
    const k = socialKpis({
      posts: all,
      allBrandPosts: all,
      brands,
      selected: [],
      platform: "instagram",
      days: 30,
    });
    expect(k.map((x) => [x.label, x.value, x.caption])).toEqual([
      ["Posts", "7", "3 brands · 30 days"],
      ["Avg engagement", "614", "likes + comments / post"],
      ["Best format", "Reels", "614 avg"],
      ["Best time", "Tue evening", "6–11 pm · US Eastern"],
    ]);
  });
  it("one brand: rank among brands, small sample", () => {
    const hims = all.filter((p) => p.competitor_id === "hims");
    const k = socialKpis({
      posts: hims,
      allBrandPosts: all,
      brands,
      selected: ["hims"],
      platform: "instagram",
      days: 7,
    });
    expect(k[0].caption).toBe("7 days · small sample");
    expect(k[1].caption).toBe("#2 of 2 brands");
  });
  it("best time without a 2-post slot says so", () => {
    const one = [post({ likes: 10 })];
    const k = socialKpis({
      posts: one,
      allBrandPosts: one,
      brands,
      selected: [],
      platform: "instagram",
      days: 30,
    });
    expect([k[3].value, k[3].caption]).toEqual(["Not enough posts", "needs 2+ posts in a slot"]);
  });
  it("TikTok adds avg views", () => {
    const tt = [
      post({ platform: "tiktok", views: 40_000 }),
      post({ platform: "tiktok", views: 20_000 }),
    ];
    const k = socialKpis({
      posts: tt,
      allBrandPosts: tt,
      brands,
      selected: [],
      platform: "tiktok",
      days: 30,
    });
    expect(k[1].caption).toBe("likes + comments / post · 30K avg views");
  });
});

describe("compare", () => {
  const posts = [
    ...Array.from({ length: 5 }, () =>
      post({ competitor_id: "hims", likes: 200, hashtags: ["glp1", "mens"] }),
    ),
    ...Array.from({ length: 3 }, () =>
      post({ competitor_id: "ro", format: "carousel", likes: 300, hashtags: ["glp1", "meal"] }),
    ),
  ];
  const two = [brands[0], brands[1]];

  it("head to head marks who is ahead", () => {
    const [hims, ro] = headToHead(posts, two);
    expect(hims).toMatchObject({
      posts: 5,
      aheadPosts: true,
      aheadEngagement: false,
      bestFormat: "Reels",
      topTag: "glp1",
      smallSample: true,
    });
    expect(ro).toMatchObject({
      posts: 3,
      aheadPosts: false,
      aheadEngagement: true,
      bestFormat: "Carousels",
      bestTimeShort: "Tue eve",
    });
    expect(hims.bestTime).toBe("Tue 6–11 pm");
  });

  it("formats side by side cover every format used", () => {
    expect(formatsByBrand(posts, two).map((r) => [r.label, r.values.map((v) => v.n)])).toEqual([
      ["Reels", [5, 0]],
      ["Carousels", [0, 3]],
    ]);
  });

  it("hashtag overlap: 2 brands → Only A · Both · Only B", () => {
    expect(hashtagOverlap(posts, two).map((c) => [c.label, c.tags.map((t) => t.tag)])).toEqual([
      ["Only Hims", ["mens"]],
      ["Both", ["glp1"]],
      ["Only Ro", ["meal"]],
    ]);
  });

  it("hashtag overlap: 3 brands → Only A · Only B · Only C · Shared", () => {
    const three = [...posts, post({ competitor_id: "hers", hashtags: ["hers1", "meal"] })];
    expect(hashtagOverlap(three, brands).map((c) => [c.label, c.tags.map((t) => t.tag)])).toEqual([
      ["Only Hims", ["mens"]],
      ["Only Ro", []],
      ["Only Hers", ["hers1"]],
      ["Shared", ["glp1", "meal"]],
    ]);
  });
});
