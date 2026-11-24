import { describe, expect, it } from "vitest";
import igPage from "./fixtures/instagram-hims.json";
import liPage from "./fixtures/linkedin-hims-hers.json";
import liNotFound from "./fixtures/linkedin-not-found.json";
import fbPage from "./fixtures/facebook-weightwatchers.json";
import fbPage2 from "./fixtures/facebook-weightwatchers-p2.json";
import fbNotFound from "./fixtures/facebook-not-found.json";
import fbProfile from "./fixtures/facebook-profile-weightwatchers.json";
import fbProfileNotFound from "./fixtures/facebook-profile-not-found.json";
import notFound from "./fixtures/instagram-not-found.json";
import ttPage from "./fixtures/tiktok-hims.json";
import {
  cutoffFor,
  decideNextPage,
  decodeLinkedInCursor,
  encodeLinkedInCursor,
  estimate,
  extractHashtags,
  FACEBOOK_PAGE_SIZE,
  facebookFormat,
  facebookPageLabel,
  facebookPageUrl,
  mapFacebookItem,
  parseFacebookProfile,
  finishStatus,
  browserImage,
  instagramThumbnail,
  LINKEDIN_PAGE_CAP,
  linkedInNextCursor,
  linkedInSlug,
  linkedInUrl,
  parseFollowers,
  parseRetryAfter,
  runningConflict,
  type MappedPost,
  parsePage,
  postColumns,
  postsInWindow,
  type PullRow,
  pullsToDelete,
  taskPageCap,
  thumbnailPath,
} from "./pull-logic.ts";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const ok = (r: ReturnType<typeof parsePage>) => {
  if (r.kind !== "ok") throw new Error(`expected ok, got ${r.code}`);
  return r;
};

describe("parsePage — Instagram (spike fixture, Hims)", () => {
  const page = ok(parsePage("instagram", igPage, 0));

  it("reads posts, next cursor, credits and followers", () => {
    expect(page.posts).toHaveLength(5);
    expect(page.nextCursor).toBe("sc:next-page-token");
    expect(page.creditsCost).toBe(2);
    expect(page.followers).toBeGreaterThan(0);
  });

  it("maps formats from media_type + product_type", () => {
    expect(page.posts.map((p) => p.format)).toEqual(["reel", "reel", "reel", "carousel", "image"]);
  });

  it("maps fields per INTEGRATIONS §2a", () => {
    const reel = page.posts[0];
    expect(reel).toMatchObject({
      platform: "instagram",
      external_id: "DfxDh1RqbNY",
      url: "https://www.instagram.com/p/DfxDh1RqbNY/",
      posted_by: "hims",
      hashtags: ["imhim"],
      counts_hidden: false,
      is_paid: false,
      is_collab: false,
      shares: null,
      saves: null,
    });
    expect(reel.views).toBeGreaterThan(0); // reels have views
    expect(reel.posted_at).toMatch(/^2026-11-1\dT/);
    expect(reel.thumbnail_source).toBe("https://scontent.example/ig/DfxDh1RqbNY-480.jpg");
  });

  it("uses the 480 px candidate for carousels and images, not the full-size display_uri", () => {
    // Slice 5 test pull: two carousels' display_uri were 366 KB and 447 KB (> 300 KB bucket limit).
    expect(page.posts[3].thumbnail_source).toBe("https://scontent.example/ig/Df0phjAF3Sd-480.jpg");
    expect(page.posts[4].thumbnail_source).toBe("https://scontent.example/ig/DfsvrBUF6Nt-480.jpg");
  });

  it("falls back to display_uri when there are no usable candidates", () => {
    expect(instagramThumbnail({ display_uri: "https://x/full.jpg" })).toBe("https://x/full.jpg");
    expect(
      instagramThumbnail({
        display_uri: "https://x/full.jpg",
        image_versions2: { candidates: [{ width: 150, url: "https://x/tiny.jpg" }] },
      }),
    ).toBe("https://x/full.jpg");
  });

  it("has no views for images and carousels", () => {
    expect(page.posts[3].views).toBeNull();
    expect(page.posts[4].views).toBeNull();
  });

  it("treats the first 3 posts of page 1 as possibly pinned — and only on page 1", () => {
    expect(page.posts.map((p) => p.pinned)).toEqual([true, true, true, false, false]);
    expect(ok(parsePage("instagram", igPage, 1)).posts.every((p) => !p.pinned)).toBe(true);
  });

  it("no cursor when more_available is false", () => {
    const last = clone(igPage);
    last.data.alexandria[0].data.more_available = false;
    expect(ok(parsePage("instagram", last, 2)).nextCursor).toBeNull();
  });
});

describe("parsePage — TikTok (spike fixture, Hims)", () => {
  const page = ok(parsePage("tiktok", ttPage, 0));

  it("maps photo posts to carousel and videos to video", () => {
    expect(page.posts.map((p) => p.format)).toEqual(["carousel", "video"]);
  });

  it("maps statistics, hashtags and pinned flag", () => {
    const photo = page.posts[0];
    expect(photo).toMatchObject({
      platform: "tiktok",
      external_id: "7708914298323766558",
      posted_by: "hims",
      hashtags: ["7", "hairregrowth", "hairtok", "hairloss"],
      pinned: false,
    });
    expect(photo.likes).toBe(1);
    expect(photo.views).toBe(65);
    expect(photo.shares).toBe(1);
    expect(photo.saves).toBe(0);
    expect(photo.thumbnail_source).toContain("-photo.webp");
    // Video covers list HEIC first; we must take the JPEG (Slice 6: no TikTok video had a thumbnail).
    expect(page.posts[1].thumbnail_source).toMatch(/~tplv-cover\.jpeg\?/);
  });

  it("uses max_cursor while has_more", () => {
    expect(page.nextCursor).toBe("1792193040141");
    expect(page.followers).toBeGreaterThan(0);
  });
});

describe("parsePage — hidden errors", () => {
  it("finds not_found inside a 200 / success:true response, costing 0", () => {
    expect(parsePage("instagram", notFound, 0)).toEqual({
      kind: "error",
      code: "not_found",
      message: "ScrapeCreators found no public page for this input.",
      creditsCost: 0,
    });
  });

  it("handles a response without results", () => {
    expect(parsePage("tiktok", { success: true, data: {} }, 0)).toMatchObject({
      kind: "error",
      code: "bad_response",
    });
  });
});

describe("extractHashtags", () => {
  it("lowercases, dedupes and keeps underscores and digits", () => {
    expect(extractHashtags("Try #GLP1 and #glp1 or #Him_Name, #7!")).toEqual([
      "glp1",
      "him_name",
      "7",
    ]);
    expect(extractHashtags(null)).toEqual([]);
  });
});

describe("decideNextPage — 30-day window, pinned posts", () => {
  const start = Date.parse("2026-11-17T12:00:00Z");
  const cutoff = cutoffFor(start, 30); // 2026-10-18T12:00Z
  const post = (date: string, pinned = false) =>
    ({ posted_at: `${date}T12:00:00Z`, pinned }) as MappedPost;
  const base = { nextCursor: "next", cutoffMs: cutoff, pagesDone: 1, pageCap: 4, budgetLeft: 100 };

  it("continues while the oldest non-pinned post is inside the window", () => {
    expect(decideNextPage({ ...base, posts: [post("2026-11-15"), post("2026-11-05")] })).toEqual({
      more: true,
    });
  });

  it("stops once a post is older than the window", () => {
    expect(decideNextPage({ ...base, posts: [post("2026-11-01"), post("2026-10-10")] })).toEqual({
      more: false,
      reason: "past_window",
    });
  });

  it("ignores a year-old pinned post (the bug the spike warned about)", () => {
    const posts = [post("2025-11-01", true), post("2026-11-16"), post("2026-11-10")];
    expect(decideNextPage({ ...base, posts })).toEqual({ more: true });
  });

  it("never exceeds the page cap or the budget", () => {
    const posts = [post("2026-11-16")];
    expect(decideNextPage({ ...base, posts, pagesDone: 4 })).toEqual({
      more: false,
      reason: "page_cap",
    });
    expect(decideNextPage({ ...base, posts, budgetLeft: 1 })).toEqual({
      more: false,
      reason: "budget",
    });
  });

  it("stops without a next page or on an empty page", () => {
    expect(decideNextPage({ ...base, posts: [post("2026-11-16")], nextCursor: null })).toEqual({
      more: false,
      reason: "no_more",
    });
    expect(decideNextPage({ ...base, posts: [] })).toEqual({ more: false, reason: "empty" });
  });

  it("only keeps posts inside the window (old pinned posts dropped)", () => {
    const kept = postsInWindow([post("2025-11-01", true), post("2026-11-16")], cutoff);
    expect(kept).toHaveLength(1);
  });
});

describe("estimate (05 / 05f)", () => {
  const tasks = ["a", "b", "c"].flatMap((id) => [
    { competitorId: id, platform: "instagram" as const },
    { competitorId: id, platform: "tiktok" as const },
  ]);

  it("uses spike defaults on the first pull", () => {
    const e = estimate(tasks, new Map(), 4);
    expect(e.perPlatform.instagram).toEqual({ tasks: 3, expected: 18, max: 24 });
    expect(e.perPlatform.tiktok).toEqual({ tasks: 3, expected: 12, max: 24 });
    expect(e.expected).toBe(30);
    expect(e.max).toBe(48);
  });

  it("uses the last pull's real cost per brand × platform, capped at the page cap", () => {
    const last = new Map([
      ["a:instagram", 2],
      ["b:instagram", 20],
    ]);
    expect(estimate(tasks, last, 4).perPlatform.instagram.expected).toBe(2 + 8 + 6);
  });

  it("6 brands × 2 platforms: ~60 expected, 96 max (as planned)", () => {
    const six = Array.from({ length: 6 }, (_, i) => String(i)).flatMap((id) => [
      { competitorId: id, platform: "instagram" as const },
      { competitorId: id, platform: "tiktok" as const },
    ]);
    const e = estimate(six, new Map(), 4);
    expect([e.expected, e.max]).toEqual([60, 96]);
  });
});

describe("finishStatus", () => {
  it("done / partial / failed", () => {
    expect(finishStatus(["done", "done"])).toBe("done");
    expect(finishStatus(["done", "failed"])).toBe("partial");
    expect(finishStatus(["failed", "failed"])).toBe("failed");
  });
});

describe("pullsToDelete — keep the last 2 per client", () => {
  const p = (id: string, status: PullRow["status"], day: number, is_test = false): PullRow => ({
    id,
    status,
    is_test,
    started_at: `2026-11-${String(day).padStart(2, "0")}T10:00:00Z`,
  });

  it("keeps the new pull and the previous good one; deletes older, failed and test pulls", () => {
    const pulls = [
      p("old", "done", 1),
      p("prev", "partial", 5),
      p("broken", "failed", 6),
      p("test", "done", 7, true),
      p("new", "done", 9),
    ];
    expect(pullsToDelete(pulls, pulls[4]).sort()).toEqual(["broken", "old", "test"]);
  });

  it("a failed real pull deletes only itself (nothing changed)", () => {
    const pulls = [p("prev", "done", 5), p("new", "failed", 9)];
    expect(pullsToDelete(pulls, pulls[1])).toEqual(["new"]);
  });

  it("a test pull only replaces older test pulls", () => {
    const pulls = [p("real", "done", 5), p("t1", "done", 6, true), p("t2", "done", 7, true)];
    expect(pullsToDelete(pulls, pulls[2])).toEqual(["t1"]);
  });

  it("never deletes another running pull", () => {
    const pulls = [p("running", "running", 8), p("new", "done", 9)];
    expect(pullsToDelete(pulls, pulls[1])).toEqual([]);
  });
});

describe("thumbnailPath", () => {
  it("stores thumbnails as delivered", () => {
    expect(thumbnailPath("c", "p", "x", "image/jpeg")).toBe("c/p/x.jpg");
    expect(thumbnailPath("c", "p", "x", "image/webp")).toBe("c/p/x.webp");
  });
});

describe("postColumns", () => {
  it("keeps only public.posts columns", () => {
    const post = ok(parsePage("instagram", igPage, 0)).posts[0];
    const cols = postColumns(post);
    expect(cols).not.toHaveProperty("thumbnail_source");
    expect(cols).not.toHaveProperty("pinned");
    expect(Object.keys(cols)).toHaveLength(17);
  });
});

describe("parseRetryAfter (Firecrawl 429)", () => {
  const now = Date.parse("2026-11-17T19:27:00Z");
  it("reads seconds and HTTP dates", () => {
    expect(parseRetryAfter("12", now)).toBe(12);
    expect(parseRetryAfter("1.2", now)).toBe(2);
    expect(parseRetryAfter("Tue, 17 Nov 2026 19:27:30 GMT", now)).toBe(30);
  });
  it("caps at 120 s and ignores missing or junk values", () => {
    expect(parseRetryAfter("600", now)).toBe(120);
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter("soon", now)).toBeNull();
  });
});

describe("browserImage (TikTok cover lists)", () => {
  it("prefers WebP, then JPEG, never HEIC", () => {
    expect(browserImage(["https://a/x.heic?s=1", "https://a/x.jpeg?s=1"])).toBe(
      "https://a/x.jpeg?s=1",
    );
    expect(browserImage(["https://a/x.jpeg", "https://a/x.webp"])).toBe("https://a/x.webp");
    expect(browserImage(["https://a/x.heic", "https://a/y.heic"])).toBeNull();
    expect(browserImage(null)).toBeNull();
  });
});

describe("parsePage — LinkedIn (HarvestAPI spike fixture, Hims & Hers)", () => {
  // Fixture: 9 items from the spike page — 7 own posts, 1 repost (by the page), 1 collab (author NYSE).
  const page = ok(parsePage("linkedin", liPage, 0));

  it("keeps only the page's own posts: reposts and collabs are dropped", () => {
    expect(page.posts).toHaveLength(7);
    expect(page.posts.every((p) => p.posted_by === "hims-&-hers")).toBe(true);
    expect(page.posts.map((p) => p.external_id)).not.toContain("7526038675055513601"); // repost
  });

  it("maps engagement: likes = all reactions, shares = reposts, no views", () => {
    const first = page.posts[0];
    expect(first).toMatchObject({
      platform: "linkedin",
      external_id: "7529164327652880385",
      posted_at: "2026-11-19T12:51:00.821Z",
      format: "article",
      likes: 64,
      comments: 2,
      shares: 2,
      views: null,
      saves: null,
    });
    expect(first.url).toContain("linkedin.com/posts/hims-%26-hers_");
    expect(first.raw.reactions).toContainEqual({ type: "LIKE", count: 58 });
  });

  it("formats: article, text, image (multi-image too), video", () => {
    expect(page.posts.map((p) => p.format)).toEqual([
      "article",
      "text",
      "text", // a quote of another post is still the page's own (text) post
      "image", // 2 images → image, not carousel
      "video",
      "image",
      "article",
    ]);
    expect(page.posts[2].raw.is_quote).toBe(true);
  });

  it("thumbnails: first image, video thumbnail or link preview image", () => {
    const by = (f: string) => page.posts.find((p) => p.format === f)!;
    expect(by("image").thumbnail_source).toContain("media.licdn.com");
    expect(by("video").thumbnail_source).toContain("thumbnail");
    expect(by("article").thumbnail_source).toContain("articleshare");
    expect(page.posts.find((p) => p.format === "text")!.thumbnail_source).toBeNull();
  });

  it("followers from the page's author block; one full page = no next page", () => {
    expect(page.followers).toBe(246391);
    expect(page.nextCursor).toBeNull(); // 41 of pageSize 50, totalPages 1
    expect(page.creditsCost).toBe(1);
  });

  it("a page that doesn't exist (invalid_option, 0 credits) = not_found", () => {
    expect(parsePage("linkedin", liNotFound, 0)).toMatchObject({
      kind: "error",
      code: "not_found",
      creditsCost: 0,
    });
  });

  it("invalid_option stays invalid_option for the other platforms", () => {
    const body = { data: { alexandria: [{ error: { code: "invalid_option" }, creditsCost: 0 }] } };
    expect(parsePage("instagram", body, 0)).toMatchObject({ code: "invalid_option" });
  });
});

describe("LinkedIn paging (an empty page still costs a credit)", () => {
  const pg = (pagination: Record<string, unknown>) => ({ pagination });
  it("stops when the page came back less than full", () => {
    expect(
      linkedInNextCursor(
        pg({ pageNumber: 1, pageSize: 50, totalPages: 3, paginationToken: "t" }),
        49,
      ),
    ).toBeNull();
  });
  it("stops on the last page LinkedIn reports", () => {
    expect(
      linkedInNextCursor(
        pg({ pageNumber: 2, pageSize: 50, totalPages: 2, paginationToken: "t" }),
        50,
      ),
    ).toBeNull();
  });
  it("a full page with more pages → page 2 + token", () => {
    const c = linkedInNextCursor(
      pg({ pageNumber: 1, pageSize: 50, totalPages: 3, paginationToken: "a|b" }),
      50,
    );
    expect(c).toBe(encodeLinkedInCursor(2, "a|b"));
    expect(decodeLinkedInCursor(c)).toEqual({ page: 2, token: "a|b" });
  });
  it("no pagination block → stop", () => {
    expect(linkedInNextCursor({}, 50)).toBeNull();
    expect(decodeLinkedInCursor(null)).toEqual({ page: 1, token: null });
  });
  it("LinkedIn tasks cap at 2 pages; other platforms keep the pull's cap", () => {
    expect(taskPageCap("linkedin", 4)).toBe(LINKEDIN_PAGE_CAP);
    expect(taskPageCap("linkedin", 1)).toBe(1);
    expect(taskPageCap("instagram", 4)).toBe(4);
  });
});

describe("linkedInSlug (company page field, validated before any credits)", () => {
  it("accepts a URL, a /company/ path or a slug, and lowercases", () => {
    expect(linkedInSlug("https://www.linkedin.com/company/hims-&-hers/")).toBe("hims-&-hers");
    expect(linkedInSlug("https://www.linkedin.com/company/hims-%26-hers/posts/?x=1")).toBe(
      "hims-&-hers",
    );
    expect(linkedInSlug("linkedin.com/company/Noom")).toBe("noom");
    expect(linkedInSlug("uk.linkedin.com/company/noom")).toBe("noom");
    expect(linkedInSlug("company/ro-health")).toBe("ro-health");
    expect(linkedInSlug(" 18260923 ")).toBe("18260923");
  });
  it("rejects personal profiles, other sites and bad slugs", () => {
    expect(linkedInSlug("https://www.linkedin.com/in/someone/")).toBeNull();
    expect(linkedInSlug("https://example.com/company/x")).toBeNull();
    expect(linkedInSlug("has space")).toBeNull();
    expect(linkedInSlug("a")).toBeNull();
    expect(linkedInSlug("")).toBeNull();
  });
  it("canonical URL", () => {
    expect(linkedInUrl("hims-&-hers")).toBe("https://www.linkedin.com/company/hims-&-hers/");
  });
});

describe("parseFollowers", () => {
  it("reads LinkedIn's follower line", () => {
    expect(parseFollowers("246,391 followers")).toBe(246391);
    expect(parseFollowers("1.2K followers")).toBe(1200);
    expect(parseFollowers("3M followers")).toBe(3_000_000);
    expect(parseFollowers(null)).toBeNull();
  });
});

describe("estimate — LinkedIn", () => {
  it("default 2 credits per LinkedIn task, max 2 pages × 2", () => {
    const tasks = ["a", "b"].map((id) => ({ competitorId: id, platform: "linkedin" as const }));
    const e = estimate(tasks, new Map(), 4);
    expect(e.perPlatform.linkedin).toEqual({ tasks: 2, expected: 4, max: 8 });
    expect(e.perPlatform.instagram).toEqual({ tasks: 0, expected: 0, max: 0 });
    expect(e.expected).toBe(4);
    expect(e.max).toBe(8);
  });
});

// ───────────────────────────────────────────── Facebook (16a, Facebook / X spike fixtures)
const fbPosts = (body: unknown) =>
  (body as { data: { alexandria: { data: { posts: Record<string, unknown>[] } }[] } }).data
    .alexandria[0].data.posts;

describe("parsePage — Facebook (ScrapeCreators spike fixture, WeightWatchers)", () => {
  it("maps the page's 3 posts: reel, link, photo", () => {
    const r = ok(parsePage("facebook", fbPage, 0));
    expect(r.creditsCost).toBe(1);
    expect(r.followers).toBeNull(); // from AnyAPI when the page is saved, not from the posts
    expect(r.posts.map((p) => p.format)).toEqual(["reel", "article", "image"]);
    expect(r.posts.every((p) => p.platform === "facebook" && !p.pinned)).toBe(true);
    const reel = r.posts[0];
    expect(reel).toMatchObject({
      external_id: "1200574805834977",
      url: "https://www.facebook.com/reel/979224541550335/",
      posted_by: "WeightWatchers",
      likes: 12, // all reactions
      comments: 3,
      shares: 3,
      views: 2771, // exact video views
      saves: null,
      is_paid: false, // is_paid_partnership: null
      counts_hidden: false,
    });
    expect(reel.posted_at).toBe(new Date(1795446193 * 1000).toISOString());
    expect(reel.thumbnail_source).toMatch(/^https:\/\/scontent/);
  });
  it("no views for photos and link posts; link posts use the link card's image", () => {
    const [, link, photo] = ok(parsePage("facebook", fbPage, 0)).posts;
    expect(link.views).toBeNull();
    expect(photo.views).toBeNull();
    const card = (fbPosts(fbPage)[1].link_attachment as { image_url: string; url: string })
      .image_url;
    expect(link.thumbnail_source).toBe(card);
    expect(link.raw.link_url).toBeTruthy();
    expect(photo.thumbnail_source).toBe(fbPosts(fbPage)[2].image);
  });
  it("page 2 (cursor) continues newest-first with no overlap", () => {
    const p1 = ok(parsePage("facebook", fbPage, 0));
    const p2 = ok(parsePage("facebook", fbPage2, 1));
    expect(p2.posts.map((p) => p.format)).toEqual(["article", "reel", "reel"]);
    const ids1 = new Set(p1.posts.map((p) => p.external_id));
    expect(p2.posts.some((p) => ids1.has(p.external_id))).toBe(false);
    expect(Date.parse(p2.posts[0].posted_at!)).toBeLessThan(Date.parse(p1.posts[2].posted_at!));
  });
  it("paging: next cursor on a full page of 3, none on a shorter page or without a cursor", () => {
    expect(FACEBOOK_PAGE_SIZE).toBe(3);
    expect(ok(parsePage("facebook", fbPage, 0)).nextCursor).toMatch(/^Cg8O/);
    const short = clone(fbPage);
    fbPosts(short).pop();
    expect(ok(parsePage("facebook", short, 0)).nextCursor).toBeNull();
    const noCursor = clone(fbPage);
    delete (noCursor.data.alexandria[0].data as { cursor?: string }).cursor;
    expect(ok(parsePage("facebook", noCursor, 0)).nextCursor).toBeNull();
  });
  it("a missing page is not_found, 0 credits (same as Instagram)", () => {
    expect(parsePage("facebook", fbNotFound, 0)).toMatchObject({
      kind: "error",
      code: "not_found",
      creditsCost: 0,
    });
  });
  it("paid partnerships are kept as is_paid", () => {
    const paid = clone(fbPosts(fbPage)[2]);
    paid.is_paid_partnership = true;
    expect(mapFacebookItem(paid)?.is_paid).toBe(true);
  });
  it("items without an id or link are skipped", () => {
    expect(mapFacebookItem({ url: "https://www.facebook.com/x/posts/1" })).toBeNull();
    expect(mapFacebookItem({ id: "1" })).toBeNull();
  });
});

describe("facebookFormat", () => {
  const base = { url: "https://www.facebook.com/x/posts/pfbid1", videoDetails: {}, images: [] };
  it.each([
    [{ ...base, url: "https://www.facebook.com/reel/1/" }, "reel"],
    [{ ...base, videoDetails: { thumbnailUrl: "t" } }, "video"],
    [{ ...base, images: ["a", "b"] }, "carousel"], // album, shown as "Album"
    [{ ...base, images: ["a"] }, "image"],
    [{ ...base, image: "a" }, "image"],
    [{ ...base, link_attachment: { url: "https://x.com" } }, "article"], // shown as "Link"
    [base, "text"],
  ])("%o → %s", (item, format) => {
    expect(facebookFormat(item)).toBe(format);
  });
});

describe("facebookPageUrl (server copy of the Competitors rule)", () => {
  it("normalises page links and usernames", () => {
    expect(facebookPageUrl("https://m.facebook.com/WeightWatchers/posts/")).toBe(
      "https://www.facebook.com/weightwatchers",
    );
    expect(facebookPageUrl("@ro.co")).toBe("https://www.facebook.com/ro.co");
    expect(facebookPageUrl("facebook.com/profile.php?id=100076474051751")).toBe(
      "https://www.facebook.com/profile.php?id=100076474051751",
    );
  });
  it("refuses groups, posts, people profiles and other sites", () => {
    for (const bad of [
      "facebook.com/groups/x",
      "facebook.com/people/A-B/1000123456",
      "facebook.com/posts/pfbid0Jm58X4TR",
      "linkedin.com/company/x",
      "",
    ])
      expect(facebookPageUrl(bad)).toBeNull();
  });
  it("label for logs and chips", () => {
    expect(facebookPageLabel("https://www.facebook.com/weightwatchers")).toBe("weightwatchers");
    expect(facebookPageLabel("https://www.facebook.com/profile.php?id=123456")).toBe("id 123456");
  });
});

describe("parseFacebookProfile (AnyAPI, followers on save)", () => {
  it("found page → followers, 5 credits", () => {
    expect(parseFacebookProfile(fbProfile)).toEqual({
      kind: "ok",
      followers: 2_901_902,
      creditsCost: 5,
    });
  });
  it("made-up page → not_found, 0 credits (measured 24 Nov)", () => {
    expect(parseFacebookProfile(fbProfileNotFound)).toMatchObject({
      kind: "error",
      code: "not_found",
      creditsCost: 0,
    });
  });
  it("a provider error is passed on, never read as not found", () => {
    const body = {
      data: { alexandria: [{ error: { code: "upstream_timeout" }, creditsCost: 0 }] },
    };
    expect(parseFacebookProfile(body)).toMatchObject({ kind: "error", code: "upstream_timeout" });
    expect(parseFacebookProfile({})).toMatchObject({ kind: "error", code: "bad_response" });
  });
});

describe("estimate — Facebook", () => {
  it("default 4 credits per Facebook task; max = the pull's 4-page cap × 2 (test: 2 pages)", () => {
    const tasks = ["a", "b"].map((id) => ({ competitorId: id, platform: "facebook" as const }));
    const e = estimate(tasks, new Map(), 4);
    expect(e.perPlatform.facebook).toEqual({ tasks: 2, expected: 8, max: 16 });
    expect(taskPageCap("facebook", 4)).toBe(4);
    expect(taskPageCap("facebook", 2)).toBe(2);
    expect(estimate(tasks, new Map([["a:facebook", 3]]), 4).perPlatform.facebook.expected).toBe(7);
  });
  it("stops at the 4-page cap even while posts are still inside the window", () => {
    const posts = ok(parsePage("facebook", fbPage, 0)).posts;
    const d = decideNextPage({
      posts,
      nextCursor: "c",
      cutoffMs: 0,
      pagesDone: 4,
      pageCap: taskPageCap("facebook", 4),
      budgetLeft: 100,
    });
    expect(d).toEqual({ more: false, reason: "page_cap" });
  });
});

describe("Facebook /p/ page links (Slice 17a)", () => {
  it("facebook.com/p/<Name>-<id> → the page by id (both forms returned the same posts)", () => {
    expect(facebookPageUrl("https://www.facebook.com/p/Carnaby-Vine-100095309165059/")).toBe(
      "https://www.facebook.com/profile.php?id=100095309165059",
    );
    expect(facebookPageUrl("facebook.com/p/Carnaby-Vine-100095309165059")).toBe(
      "https://www.facebook.com/profile.php?id=100095309165059",
    );
    expect(facebookPageUrl("https://www.facebook.com/p/no-id-here/")).toBeNull();
    expect(facebookPageUrl("https://www.facebook.com/p/")).toBeNull();
  });
});

describe("runningConflict — one pull at a time across clients (Slice 17a)", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  it("nothing running → free to start", () => {
    expect(runningConflict(null, A)).toBeNull();
  });
  it("same client → follow it", () => {
    expect(runningConflict({ id: "p1", client_id: A }, A)).toEqual({
      status: "running",
      pullId: "p1",
    });
  });
  it("another client → say who", () => {
    expect(runningConflict({ id: "p1", client_id: B, clients: { name: "OBU Health" } }, A)).toEqual(
      {
        status: "other_running",
        clientName: "OBU Health",
      },
    );
    expect(runningConflict({ id: "p1", client_id: B, clients: null }, A)).toEqual({
      status: "other_running",
      clientName: "Another client",
    });
  });
});
