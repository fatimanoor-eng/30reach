// Pure pull-pipeline logic (no Deno APIs) — shared by pull-start / pull-task / pull-finish and
// tested by Vitest with trimmed Slice 1 spike fixtures (./fixtures). See docs/INTEGRATIONS.md §2a, §3.

export type Platform = "instagram" | "tiktok";
export const PLATFORMS: Platform[] = ["instagram", "tiktok"];

export const CREDITS_PER_PAGE = 2; // ScrapeCreators via Firecrawl, measured in the spike
export const PAGE_CAP = 4; // per brand × platform task
export const TEST_PAGE_CAP = 2;
export const WINDOW_DAYS = 30;
/** First-pull estimate per task (spike: IG ~3 pages, TikTok ~1–2 pages for 30 days). */
export const DEFAULT_TASK_CREDITS: Record<Platform, number> = { instagram: 6, tiktok: 4 };
/** Instagram allows up to 3 pinned posts; they sit at the top of page 1 and carry no flag. */
export const IG_MAX_PINNED = 3;

export type PostFormat = "reel" | "carousel" | "image" | "video";

/** A post ready for public.posts (minus pull/client/competitor ids). */
export type MappedPost = {
  platform: Platform;
  external_id: string;
  url: string;
  posted_at: string | null;
  posted_by: string | null;
  format: PostFormat | null;
  caption: string | null;
  hashtags: string[];
  likes: number | null;
  comments: number | null;
  views: number | null;
  shares: number | null;
  saves: number | null;
  counts_hidden: boolean;
  is_paid: boolean;
  is_collab: boolean;
  raw: Record<string, unknown>;
  /** Not stored: where to download the thumbnail from (links expire in days). */
  thumbnail_source: string | null;
  /** Not stored: pinned posts are ignored when deciding whether to fetch another page. */
  pinned: boolean;
};

export type PageResult =
  | {
      kind: "ok";
      posts: MappedPost[];
      nextCursor: string | null;
      creditsCost: number;
      followers: number | null;
    }
  | { kind: "error"; code: string; message: string; creditsCost: number };

// ───────────────────────────────────────────── helpers
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const isoFromSeconds = (v: unknown): string | null => {
  const n = num(v);
  return n === null ? null : new Date(n * 1000).toISOString();
};

/** "#GLP1 and #glp1, #Him_Name" → ["glp1", "him_name"] (lowercase, unique, in order). */
export function extractHashtags(text: string | null): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) seen.add(m[1].toLowerCase());
  return [...seen];
}

// ───────────────────────────────────────────── mapping (INTEGRATIONS.md §2a)
/** Smallest width that still looks sharp in a post card (cards are ≤ 240 px wide, 2× for retina). */
export const THUMB_MIN_WIDTH = 480;

/**
 * Instagram thumbnail URL. For carousels and images `display_uri` is the FULL-resolution image
 * (1440 × 1800, often 300–450 KB, over the bucket limit — found in Slice 5's test pull), so prefer the
 * smallest `image_versions2` candidate that is at least 480 px wide (~25–35 KB). Reels' display_uri is
 * already 480 px. Fall back to display_uri when there are no candidates.
 */
export function instagramThumbnail(item: unknown): string | null {
  const candidates = obj(item).image_versions2;
  const list = Array.isArray(obj(candidates).candidates)
    ? (obj(candidates).candidates as unknown[])
    : [];
  const usable = list
    .map((c) => ({ url: str(obj(c).url), width: num(obj(c).width) ?? 0 }))
    .filter((c): c is { url: string; width: number } => !!c.url && c.width >= THUMB_MIN_WIDTH)
    .sort((a, b) => a.width - b.width);
  return usable[0]?.url ?? str(obj(item).display_uri);
}

export function mapInstagramItem(item: unknown, pinned: boolean): MappedPost | null {
  const it = obj(item);
  const code = str(it.code) ?? (it.pk != null ? String(it.pk) : null);
  if (!code) return null;
  const mediaType = num(it.media_type);
  const productType = str(it.product_type);
  const format: PostFormat | null =
    mediaType === 8
      ? "carousel"
      : mediaType === 2
        ? productType === "clips"
          ? "reel"
          : "video"
        : mediaType === 1
          ? "image"
          : null;
  const caption = str(obj(it.caption).text);
  return {
    platform: "instagram",
    external_id: code,
    url: str(it.url) ?? `https://www.instagram.com/p/${code}/`,
    posted_at: isoFromSeconds(it.taken_at),
    posted_by: str(obj(it.owner).username),
    format,
    caption,
    hashtags: extractHashtags(caption),
    likes: num(it.like_count),
    comments: num(it.comment_count),
    // Instagram has view counts for reels/videos only; images and carousels stay null.
    views:
      format === "reel" || format === "video"
        ? (num(it.play_count) ?? num(it.ig_play_count))
        : null,
    shares: null,
    saves: null,
    counts_hidden: it.like_and_view_counts_disabled === true,
    is_paid: it.is_paid_partnership === true,
    is_collab: Array.isArray(it.coauthor_producers) && it.coauthor_producers.length > 0,
    raw: {
      pk: it.pk ?? null,
      media_type: mediaType,
      product_type: productType,
      carousel_media_count: num(it.carousel_media_count),
      video_duration: num(it.video_duration),
    },
    thumbnail_source: instagramThumbnail(it),
    pinned,
  };
}

export function mapTikTokItem(item: unknown): MappedPost | null {
  const v = obj(item);
  const id = v.aweme_id != null ? String(v.aweme_id) : null;
  if (!id) return null;
  const stats = obj(v.statistics);
  const author = obj(v.author);
  const isPhoto = v.image_post_info != null;
  const caption = str(v.desc);
  const fromTextExtra = Array.isArray(v.text_extra)
    ? v.text_extra
        .map((t) => str(obj(t).hashtag_name)?.toLowerCase())
        .filter((t): t is string => !!t)
    : [];
  const photoCover = obj(obj(obj(v.image_post_info).image_post_cover).display_image).url_list;
  const videoCover = obj(obj(v.video).cover).url_list;
  const firstUrl = (list: unknown) => (Array.isArray(list) ? str(list[0]) : null);
  return {
    platform: "tiktok",
    external_id: id,
    url:
      str(v.url) ??
      str(v.share_url) ??
      `https://www.tiktok.com/@${str(author.unique_id) ?? "_"}/${isPhoto ? "photo" : "video"}/${id}`,
    posted_at: isoFromSeconds(v.create_time),
    posted_by: str(author.unique_id),
    format: isPhoto ? "carousel" : "video",
    caption,
    hashtags: fromTextExtra.length ? [...new Set(fromTextExtra)] : extractHashtags(caption),
    likes: num(stats.digg_count),
    comments: num(stats.comment_count),
    views: num(stats.play_count),
    shares: num(stats.share_count),
    saves: num(stats.collect_count),
    counts_hidden: false,
    is_paid: v.is_paid_partnership === true || v.is_ads === true,
    is_collab: Array.isArray(v.branded_content_accounts) && v.branded_content_accounts.length > 0,
    raw: { aweme_type: num(v.aweme_type), duration: num(obj(v.video).duration) },
    thumbnail_source: firstUrl(photoCover) ?? firstUrl(videoCover),
    pinned: v.is_top === 1 || v.is_top === true,
  };
}

/**
 * Firecrawl /v2/scrape (alexandria, scrapecreators) → one page of posts.
 * Errors arrive with HTTP 200 + success:true, inside data.alexandria[0].error — always check.
 * `pageIndex` = how many pages this task fetched before (0 for the first page).
 */
export function parsePage(platform: Platform, body: unknown, pageIndex: number): PageResult {
  const data = obj(obj(body).data);
  const item = Array.isArray(data.alexandria) ? obj(data.alexandria[0]) : null;
  const creditsCost = num(item?.creditsCost) ?? num(data.creditsCost) ?? 0;
  if (!item)
    return { kind: "error", code: "bad_response", message: "No result in response", creditsCost };
  if (item.error) {
    const e = obj(item.error);
    return {
      kind: "error",
      code: str(e.code) ?? "provider_error",
      message: str(e.message) ?? "Provider error",
      creditsCost,
    };
  }
  const page = obj(item.data);
  if (platform === "instagram") {
    const items = Array.isArray(page.items) ? page.items : [];
    const posts = items
      .map((it, i) =>
        mapInstagramItem(it, pageIndex === 0 && i < IG_MAX_PINNED && items.length > IG_MAX_PINNED),
      )
      .filter((p): p is MappedPost => p !== null);
    return {
      kind: "ok",
      posts,
      nextCursor: page.more_available === true ? str(page.next_max_id) : null,
      creditsCost,
      followers: num(obj(page.user).follower_count),
    };
  }
  const list = Array.isArray(page.aweme_list) ? page.aweme_list : [];
  const posts = list.map(mapTikTokItem).filter((p): p is MappedPost => p !== null);
  const more = page.has_more === 1 || page.has_more === true;
  return {
    kind: "ok",
    posts,
    nextCursor: more && page.max_cursor != null ? String(page.max_cursor) : null,
    creditsCost,
    // TikTok carries the follower count on each post's author.
    followers: list.length ? num(obj(obj(list[0]).author).follower_count) : null,
  };
}

/** The public.posts columns of a mapped post (drops thumbnail_source and pinned). */
export function postColumns(p: MappedPost) {
  return {
    platform: p.platform,
    external_id: p.external_id,
    url: p.url,
    posted_at: p.posted_at,
    posted_by: p.posted_by,
    format: p.format,
    caption: p.caption,
    hashtags: p.hashtags,
    likes: p.likes,
    comments: p.comments,
    views: p.views,
    shares: p.shares,
    saves: p.saves,
    counts_hidden: p.counts_hidden,
    is_paid: p.is_paid,
    is_collab: p.is_collab,
    raw: p.raw,
  };
}

// ───────────────────────────────────────────── pagination
export const cutoffFor = (startedAt: string | number, windowDays: number) =>
  new Date(startedAt).getTime() - windowDays * 24 * 60 * 60 * 1000;

/** Only posts inside the window are saved (old pinned posts would skew the numbers). */
export function postsInWindow(posts: MappedPost[], cutoffMs: number): MappedPost[] {
  return posts.filter((p) => p.posted_at !== null && Date.parse(p.posted_at) >= cutoffMs);
}

export type StopReason = "no_more" | "page_cap" | "budget" | "past_window" | "empty";

/**
 * After a page: fetch another one? Yes only if there is a next page, the task is under its page cap,
 * the pull's budget allows another page, and the oldest NON-pinned post is still inside the window.
 */
export function decideNextPage(args: {
  posts: MappedPost[];
  nextCursor: string | null;
  cutoffMs: number;
  pagesDone: number;
  pageCap: number;
  budgetLeft: number;
}): { more: true } | { more: false; reason: StopReason } {
  const { posts, nextCursor, cutoffMs, pagesDone, pageCap, budgetLeft } = args;
  if (!nextCursor) return { more: false, reason: "no_more" };
  if (posts.length === 0) return { more: false, reason: "empty" };
  if (pagesDone >= pageCap) return { more: false, reason: "page_cap" };
  if (budgetLeft < CREDITS_PER_PAGE) return { more: false, reason: "budget" };
  const dated = posts
    .filter((p) => !p.pinned && p.posted_at !== null)
    .map((p) => Date.parse(p.posted_at!));
  if (dated.length === 0) return { more: true }; // a page of only pinned posts — keep going
  return Math.min(...dated) < cutoffMs ? { more: false, reason: "past_window" } : { more: true };
}

// ───────────────────────────────────────────── estimate (05 / 05f)
export type TaskKey = { competitorId: string; platform: Platform };
export const taskKey = (t: TaskKey) => `${t.competitorId}:${t.platform}`;

export type Estimate = {
  perPlatform: Record<Platform, { tasks: number; expected: number; max: number }>;
  expected: number;
  /** Hard ceiling: tasks × pageCap × 2. Used for the credits check and the pull's budget. */
  max: number;
};

/** Expected = credits the same brand × platform used in the last successful pull (or the default). */
export function estimate(
  tasks: TaskKey[],
  lastCredits: Map<string, number>,
  pageCap: number,
): Estimate {
  const perPlatform = {
    instagram: { tasks: 0, expected: 0, max: 0 },
    tiktok: { tasks: 0, expected: 0, max: 0 },
  };
  const ceiling = pageCap * CREDITS_PER_PAGE;
  for (const t of tasks) {
    const p = perPlatform[t.platform];
    p.tasks += 1;
    p.expected += Math.min(
      lastCredits.get(taskKey(t)) ?? DEFAULT_TASK_CREDITS[t.platform],
      ceiling,
    );
    p.max += ceiling;
  }
  return {
    perPlatform,
    expected: perPlatform.instagram.expected + perPlatform.tiktok.expected,
    max: perPlatform.instagram.max + perPlatform.tiktok.max,
  };
}

// ───────────────────────────────────────────── finish + cleanup
export type TaskStatus = "queued" | "running" | "done" | "failed";

export function finishStatus(statuses: TaskStatus[]): "done" | "partial" | "failed" {
  const done = statuses.filter((s) => s === "done").length;
  if (done === statuses.length && done > 0) return "done";
  return done > 0 ? "partial" : "failed";
}

export type PullRow = {
  id: string;
  status: "running" | "done" | "partial" | "failed";
  is_test: boolean;
  started_at: string;
};

/**
 * Which pulls to delete after `current` finished (CLAUDE.md rule 7: keep the last 2 per client).
 * • real pull done/partial → keep it + the newest other done/partial real pull; delete older real pulls,
 *   failed real pulls, and all test pulls.
 * • real pull failed → delete only it ("Nothing changed").
 * • test pull → delete older test pulls; real pulls untouched.
 * Running pulls (other than `current`) are never deleted.
 */
export function pullsToDelete(pulls: PullRow[], current: PullRow): string[] {
  const others = pulls.filter((p) => p.id !== current.id && p.status !== "running");
  if (current.is_test) {
    return current.status === "failed"
      ? [current.id, ...others.filter((p) => p.is_test).map((p) => p.id)]
      : others.filter((p) => p.is_test).map((p) => p.id);
  }
  if (current.status === "failed") return [current.id];
  const keptPrevious = others
    .filter((p) => !p.is_test && (p.status === "done" || p.status === "partial"))
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
  return others.filter((p) => p.id !== keptPrevious?.id).map((p) => p.id);
}

/** Storage path for a post thumbnail; extension from the downloaded content type. */
export function thumbnailPath(
  clientId: string,
  pullId: string,
  postId: string,
  contentType: string,
) {
  const ext = contentType.includes("webp") ? "webp" : contentType.includes("png") ? "png" : "jpg";
  return `${clientId}/${pullId}/${postId}.${ext}`;
}
