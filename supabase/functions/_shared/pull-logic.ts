// Pure pull-pipeline logic (no Deno APIs) — shared by pull-start / pull-task / pull-finish and
// tested by Vitest with trimmed Slice 1 spike fixtures (./fixtures). See docs/INTEGRATIONS.md §2a, §3.

export type Platform = "instagram" | "tiktok" | "linkedin" | "facebook" | "x";
export const PLATFORMS: Platform[] = ["instagram", "tiktok", "linkedin", "facebook", "x"];

/** The competitors column that says where to pull each platform from. */
export const TARGET_COLUMN = {
  instagram: "instagram_handle",
  tiktok: "tiktok_handle",
  linkedin: "linkedin_url",
  facebook: "facebook_url",
  x: "x_handle",
} as const satisfies Record<Platform, string>;
export const STATUS_COLUMN = {
  instagram: "instagram_status",
  tiktok: "tiktok_status",
  linkedin: "linkedin_status",
  facebook: "facebook_status",
  x: "x_status",
} as const satisfies Record<Platform, string>;

/**
 * Ceiling per page call. ScrapeCreators (Instagram/TikTok) measured 2 in the Slice 1 spike; HarvestAPI
 * (LinkedIn) measured 1 in the LinkedIn spike but is listed at 2; ScrapeCreators Facebook measured 1
 * (Facebook / X spike). 2 stays the safe maximum for all of them.
 */
export const CREDITS_PER_PAGE = 2;
/**
 * X (Slice 17g): AnyAPI twitter/search costs 5 per page, also for an empty page (Facebook / X spike). One
 * combined search covers every brand's X handle (`from:a OR from:b`), ~20 posts a page, up to 3 pages; if the
 * combined search fails on its first call (it can time out: free), each brand gets one page of its own.
 */
export const X_CREDITS_PER_PAGE = 5;
export const X_PAGE_CAP = 3;
export const X_SOLO_PAGE_CAP = 1;
export const pageCredits = (platform: Platform) =>
  platform === "x" ? X_CREDITS_PER_PAGE : CREDITS_PER_PAGE;
export const PAGE_CAP = 4; // per brand × platform task
export const TEST_PAGE_CAP = 2;
/** LinkedIn pages hold up to 50 posts (~a year for Hims & Hers), so 2 pages always cover 30 days. */
export const LINKEDIN_PAGE_CAP = 2;
/**
 * Facebook pages hold only 3 posts (provider limit), so a busy brand needs ~10–12 pages for 30 days.
 * Facebook keeps the pull's cap (4, test 2): the newest 12 posts at most. The pages say so in 16b.
 */
export const FACEBOOK_PAGE_SIZE = 3;
export const WINDOW_DAYS = 30;
/**
 * First-pull estimate per task (spikes: IG ~3 pages, TikTok ~1–2 pages, LinkedIn 1 page for 30 days,
 * Facebook 4 pages × 1 credit for a brand that posts daily).
 */
export const DEFAULT_TASK_CREDITS: Record<Platform, number> = {
  instagram: 6,
  tiktok: 4,
  linkedin: 2,
  facebook: 4,
  x: 5,
};
/** Instagram allows up to 3 pinned posts; they sit at the top of page 1 and carry no flag. */
export const IG_MAX_PINNED = 3;

/** Page cap for one task: the pull's cap, lowered for LinkedIn. */
export const taskPageCap = (platform: Platform, pullPageCap: number) =>
  platform === "linkedin"
    ? Math.min(pullPageCap, LINKEDIN_PAGE_CAP)
    : platform === "x"
      ? Math.min(pullPageCap, X_PAGE_CAP)
      : pullPageCap;

export type PostFormat =
  "reel" | "carousel" | "image" | "video" | "text" | "document" | "article" | "poll";

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
      /** X (17g): one search covers several brands; followers per author handle (lowercase). */
      followersBy?: Record<string, number>;
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

/**
 * First URL in a TikTok url_list that browsers (and the post-thumbs bucket) accept: WebP, then JPEG.
 * Video covers list HEIC first (image/heic — found in Slice 6: no TikTok video had a thumbnail), with a
 * JPEG of the same cover later in the list. HEIC and unknown types are skipped.
 */
export function browserImage(list: unknown): string | null {
  if (!Array.isArray(list)) return null;
  const urls = list.map(str).filter((u): u is string => !!u);
  const ext = (u: string) => {
    try {
      return new URL(u).pathname.toLowerCase().match(/\.(\w+)$/)?.[1] ?? "";
    } catch {
      return "";
    }
  };
  return (
    urls.find((u) => ext(u) === "webp") ??
    urls.find((u) => ext(u) === "jpeg" || ext(u) === "jpg") ??
    null
  );
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
  const originCover = obj(obj(v.video).origin_cover).url_list;
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
    thumbnail_source:
      browserImage(photoCover) ?? browserImage(videoCover) ?? browserImage(originCover),
    pinned: v.is_top === 1 || v.is_top === true,
  };
}

// ───────────────────────────────────────────── LinkedIn (INTEGRATIONS.md › LinkedIn spike)
/**
 * LinkedIn company page → slug, or null if it isn't a company page. Accepts a full URL
 * ("https://www.linkedin.com/company/hims-&-hers/posts/"), "linkedin.com/company/x", "company/x" or
 * just the slug. Slugs are lowercase letters, digits, "-", "_", "." and "&" (e.g. "hims-&-hers"), or a
 * numeric company id. Same rule as the browser (src/features/competitors/competitor-rules.ts).
 */
export const LINKEDIN_SLUG = /^[a-z0-9][a-z0-9&._-]{1,99}$/;
export function linkedInSlug(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  const link = v.match(
    /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/company\/([^/?#]+)|^company\/([^/?#]+)/i,
  );
  if (link) v = link[1] ?? link[2];
  else if (/[/:]/.test(v)) return null; // some other link (a personal /in/ profile, another site)
  try {
    v = decodeURIComponent(v);
  } catch {
    return null;
  }
  v = v.toLowerCase();
  return LINKEDIN_SLUG.test(v) ? v : null;
}
export const linkedInUrl = (slug: string) => `https://www.linkedin.com/company/${slug}/`;

/** "246,391 followers" / "1.2K followers" / "3M followers" → number. */
export function parseFollowers(info: unknown): number | null {
  const m = str(info)?.match(/([\d.,]+)\s*([KkMm])?\s+followers/);
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const mult = m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
  return Math.round(base * mult);
}

const nonEmpty = (v: unknown) =>
  Array.isArray(v) ? v.length > 0 : !!v && typeof v === "object" && Object.keys(v).length > 0;

/**
 * Format from the HarvestAPI item. Documents and polls weren't in the spike's page, so their keys are a
 * best guess (`document`, `poll`); anything unrecognised falls back to text and `raw.keys` records what
 * came back, so a real pull can correct this.
 */
export function linkedInFormat(it: Obj): PostFormat {
  if (nonEmpty(it.postVideo)) return "video";
  if (nonEmpty(it.document)) return "document";
  if (nonEmpty(it.poll)) return "poll";
  if (nonEmpty(it.postImages)) return "image"; // one or more images (multi-image is not a carousel)
  if (nonEmpty(it.article)) return "article";
  return "text";
}

/**
 * The page's own post → MappedPost; null for anything else on the page's feed: posts it reposted
 * (`repostedBy`) and posts by other authors it collaborated on. `pageIds` = the company id(s) Firecrawl
 * resolved the page to (`data.query.companyIds`).
 */
export function mapLinkedInItem(item: unknown, pageIds: string[]): MappedPost | null {
  const it = obj(item);
  const id = str(it.id) ?? str(it.entityId);
  if (!id || nonEmpty(it.repostedBy)) return null;
  const author = obj(it.author);
  if (pageIds.length && !pageIds.includes(String(author.id ?? ""))) return null;
  const engagement = obj(it.engagement);
  const format = linkedInFormat(it);
  const caption = str(it.content);
  const images = Array.isArray(it.postImages) ? it.postImages : [];
  const reactions = Array.isArray(engagement.reactions)
    ? engagement.reactions.map((r) => ({ type: str(obj(r).type), count: num(obj(r).count) }))
    : [];
  return {
    platform: "linkedin",
    external_id: id,
    url: str(it.linkedinUrl) ?? `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`,
    posted_at: str(obj(it.postedAt).date),
    posted_by: str(author.universalName) ?? str(author.publicIdentifier),
    format,
    caption,
    hashtags: extractHashtags(caption),
    likes: num(engagement.likes), // all reactions together
    comments: num(engagement.comments),
    views: null, // LinkedIn doesn't expose views for company posts
    shares: num(engagement.shares), // reposts
    saves: null,
    counts_hidden: false,
    is_paid: false,
    is_collab: false,
    raw: {
      reactions,
      image_count: images.length,
      is_quote: nonEmpty(it.repost),
      keys: Object.keys(it).sort(),
    },
    thumbnail_source:
      str(obj(images[0]).url) ??
      str(obj(it.postVideo).thumbnailUrl) ??
      str(obj(obj(it.article).image).url) ??
      null,
    pinned: false,
  };
}

/** HarvestAPI paging: `page` + `paginationToken` packed into one cursor ("2|token"). */
export function encodeLinkedInCursor(page: number, token: string | null) {
  return `${page}|${token ?? ""}`;
}
export function decodeLinkedInCursor(cursor: string | null): {
  page: number;
  token: string | null;
} {
  if (!cursor) return { page: 1, token: null };
  const [page, ...rest] = cursor.split("|");
  const n = Number(page);
  return { page: Number.isInteger(n) && n > 1 ? n : 1, token: rest.join("|") || null };
}

/**
 * Next LinkedIn page, or null. An empty page still costs a credit (spike), so stop when this page
 * came back less than full or it was the last page LinkedIn reports.
 */
export function linkedInNextCursor(page: Obj, elementCount: number): string | null {
  const p = obj(page.pagination);
  const pageNumber = num(p.pageNumber);
  const pageSize = num(p.pageSize);
  const totalPages = num(p.totalPages);
  if (pageNumber === null || pageSize === null) return null;
  if (elementCount < pageSize) return null;
  if (totalPages !== null && pageNumber >= totalPages) return null;
  return encodeLinkedInCursor(pageNumber + 1, str(p.paginationToken));
}

// ───────────────────────────────────────────── Facebook (INTEGRATIONS.md › Facebook / X spike)
/** First path parts that are never a page: groups, events, single posts, personal profiles, Facebook's own. */
const FACEBOOK_NOT_A_PAGE = new Set([
  "groups",
  "events",
  "watch",
  "reel",
  "reels",
  "videos",
  "photo",
  "photo.php",
  "photos",
  "posts",
  "permalink.php",
  "story.php",
  "share",
  "sharer",
  "sharer.php",
  "people",
  "pages",
  "marketplace",
  "gaming",
  "hashtag",
  "login",
  "help",
  "policies",
  "settings",
  "home.php",
  "search",
  "stories",
]);
/** Facebook page usernames: letters, digits and "." (older vanity names also have "-"). Lowercase. */
export const FACEBOOK_SLUG = /^[a-z0-9][a-z0-9.-]{1,99}$/;

/**
 * Facebook page link → canonical URL, or null if it isn't a page link. Accepts
 * "https://www.facebook.com/weightwatchers/", "m.facebook.com/weightwatchers/posts", "fb.com/x",
 * "facebook.com/profile.php?id=123", "@weightwatchers" or just "weightwatchers". Refuses groups, events,
 * single posts and reels, /people/ profiles and other sites. Canonical form:
 * https://www.facebook.com/<slug> (or https://www.facebook.com/profile.php?id=<id>), no trailing slash —
 * the form both providers answered to in the spike. Same rule as the browser (competitor-rules.ts).
 */
export function facebookPageUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const link = v.match(
    /^(?:https?:\/\/)?(?:(?:www|m|web|mobile|business)\.)?(?:facebook\.com|fb\.com)(\/[^?#]*)?(\?[^#]*)?/i,
  );
  let slug: string;
  if (link) {
    const parts = (link[1] ?? "").split("/").filter(Boolean);
    if (parts.length === 0) return null;
    const first = parts[0].toLowerCase();
    if (first === "profile.php") {
      const id = new URLSearchParams(link[2] ?? "").get("id");
      return id && /^\d{5,25}$/.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : null;
    }
    // Newer page links: facebook.com/p/<Name>-<id>/ → the same page by id (17a; both forms returned the
    // same posts in a test, 1 credit each). The id is stable when the page is renamed.
    if (first === "p") {
      const id = parts[1]?.match(/-(\d{5,25})$/)?.[1];
      return id ? `https://www.facebook.com/profile.php?id=${id}` : null;
    }
    if (FACEBOOK_NOT_A_PAGE.has(first)) return null;
    slug = parts[0];
  } else {
    if (/[/:?#\s]/.test(v)) return null; // some other link or text
    slug = v.replace(/^@/, "");
  }
  try {
    slug = decodeURIComponent(slug).toLowerCase();
  } catch {
    return null;
  }
  return FACEBOOK_SLUG.test(slug) && !FACEBOOK_NOT_A_PAGE.has(slug)
    ? `https://www.facebook.com/${slug}`
    : null;
}

/** "https://www.facebook.com/weightwatchers" → "weightwatchers"; profile.php links → "id 123…". */
export function facebookPageLabel(url: string): string {
  const id = url.match(/profile\.php\?id=(\d+)/)?.[1];
  return id ? `id ${id}` : url.replace(/^https:\/\/www\.facebook\.com\//, "");
}

/**
 * Format from the ScrapeCreators item. `videoDetails` is `{}` on posts without a video (spike), so
 * "non-empty" is the test. Reels: the link has /reel/ (they also carry one image = the cover).
 * More than one image = an album (shown as "Album"; not seen in the spike). Link cards → "article"
 * (shown as "Link", like LinkedIn).
 */
export function facebookFormat(it: Obj): PostFormat {
  if (/\/reel\//.test(str(it.url) ?? "") || /\/reel\//.test(str(it.permalink) ?? "")) return "reel";
  if (nonEmpty(it.videoDetails)) return "video";
  const images = Array.isArray(it.images) ? it.images.length : 0;
  if (images > 1) return "carousel";
  if (images === 1 || str(it.image)) return "image";
  if (nonEmpty(it.link_attachment)) return "article";
  return "text";
}

export function mapFacebookItem(item: unknown): MappedPost | null {
  const it = obj(item);
  const id = str(it.id) ?? (num(it.id) !== null ? String(it.id) : null);
  const url = str(it.url) ?? str(it.permalink);
  if (!id || !url) return null;
  const format = facebookFormat(it);
  const caption = str(it.text);
  const author = obj(it.author);
  const link = obj(it.link_attachment);
  const images = Array.isArray(it.images) ? it.images : [];
  const reactionTypes = obj(it.reaction_counts);
  return {
    platform: "facebook",
    external_id: id,
    url,
    posted_at: isoFromSeconds(it.publishTime) ?? str(it.creation_time),
    posted_by: str(author.short_name) ?? str(author.name),
    format,
    caption,
    hashtags: extractHashtags(caption),
    likes: num(it.reactionCount), // all reactions together (like, love, care, haha…)
    comments: num(it.commentCount),
    // Exact views on videos and reels only; photos, links and text have none.
    views: format === "reel" || format === "video" ? num(it.videoViewCount) : null,
    shares: num(it.share_count),
    saves: null,
    counts_hidden: false,
    is_paid: it.is_paid_partnership === true,
    is_collab: false,
    raw: {
      reactions: Object.fromEntries(
        Object.entries(reactionTypes).filter(([, v]) => typeof v === "number"),
      ),
      image_count: images.length,
      link_url: str(link.url),
      link_title: str(link.title),
      keys: Object.keys(it).sort(),
    },
    thumbnail_source:
      str(it.image) ??
      str(obj(it.videoDetails).thumbnailUrl) ??
      (typeof images[0] === "string" ? images[0] : str(obj(images[0]).url)) ??
      str(link.image_url) ??
      null,
    pinned: false,
  };
}

/**
 * Next Facebook page, or null. Pages hold 3 posts; a shorter page means the feed ended (we don't know
 * whether an empty page is charged, so don't ask for one).
 */
export function facebookNextCursor(page: Obj, itemCount: number): string | null {
  if (itemCount < FACEBOOK_PAGE_SIZE) return null;
  return str(page.cursor);
}

export type ProfileResult =
  | { kind: "ok"; followers: number | null; creditsCost: number }
  | { kind: "error"; code: string; message: string; creditsCost: number };

/**
 * AnyAPI facebook/profile (Competitors' Facebook check, Slice 16a) → followers. A page that doesn't
 * exist comes back as `output: { found: false, reason: "not_found" }`, 0 credits (measured 24 Nov);
 * a found page costs 5.
 */
export function parseFacebookProfile(body: unknown): ProfileResult {
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
  const output = obj(obj(item.data).output);
  if (output.found !== true) {
    const reason = str(output.reason) ?? "not_found";
    return { kind: "error", code: reason, message: `Facebook page: ${reason}`, creditsCost };
  }
  const page = obj(output.data);
  return { kind: "ok", followers: num(page.followers) ?? num(page.likes), creditsCost };
}

/**
 * Firecrawl /v2/scrape (alexandria: scrapecreators for Instagram/TikTok/Facebook, harvestapi for LinkedIn)
 * → one page of posts.
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
    const code = str(e.code) ?? "provider_error";
    return {
      kind: "error",
      // HarvestAPI answers a company page that doesn't exist with invalid_option (400), not not_found
      // (LinkedIn spike). We only ever send well-formed company URLs (linkedInSlug), so it means "not found".
      code: platform === "linkedin" && code === "invalid_option" ? "not_found" : code,
      message: str(e.message) ?? "Provider error",
      creditsCost,
    };
  }
  const page = obj(item.data);
  if (platform === "x") {
    const out = obj(obj(page.output).data);
    const list = Array.isArray(out.items) ? out.items : [];
    const followersBy: Record<string, number> = {};
    for (const it of list) {
      const o = obj(it);
      const who = str(o.authorUsername)?.toLowerCase();
      const f = num(o.authorFollowers);
      if (who && f !== null) followersBy[who] = f;
    }
    return {
      kind: "ok",
      posts: list.map(mapXItem).filter((p): p is MappedPost => p !== null),
      nextCursor: list.length ? str(out.nextCursor) : null,
      creditsCost,
      followers: null,
      followersBy,
    };
  }
  if (platform === "facebook") {
    const list = Array.isArray(page.posts) ? page.posts : [];
    return {
      kind: "ok",
      posts: list.map(mapFacebookItem).filter((p): p is MappedPost => p !== null),
      nextCursor: facebookNextCursor(page, list.length),
      creditsCost,
      // Not in the posts list: saved once from AnyAPI when the page is saved in Competitors.
      followers: null,
    };
  }
  if (platform === "linkedin") {
    const list = Array.isArray(page.elements) ? page.elements : [];
    const pageIds = Array.isArray(obj(page.query).companyIds)
      ? (obj(page.query).companyIds as unknown[]).map(String)
      : [];
    const posts = list
      .map((it) => mapLinkedInItem(it, pageIds))
      .filter((p): p is MappedPost => p !== null);
    // Followers: on the page's own author block ("246,391 followers").
    const own = list.find((it) => pageIds.includes(String(obj(obj(it).author).id ?? "")));
    return {
      kind: "ok",
      posts,
      nextCursor: linkedInNextCursor(page, list.length),
      creditsCost,
      followers: parseFollowers(obj(obj(own ?? list[0]).author).info),
    };
  }
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
  /** Credits the next page would cost (X: 5). */
  pageCost?: number;
  /** X: results aren't date-ordered, so the oldest post says nothing about the next page. */
  unordered?: boolean;
}): { more: true } | { more: false; reason: StopReason } {
  const { posts, nextCursor, cutoffMs, pagesDone, pageCap, budgetLeft } = args;
  if (!nextCursor) return { more: false, reason: "no_more" };
  if (posts.length === 0) return { more: false, reason: "empty" };
  if (pagesDone >= pageCap) return { more: false, reason: "page_cap" };
  if (budgetLeft < (args.pageCost ?? CREDITS_PER_PAGE)) return { more: false, reason: "budget" };
  // X "Latest" isn't strictly date-ordered, and the query already says since: — keep paging on the cursor.
  if (args.unordered) return { more: true };
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
  /** Hard ceiling: Σ task page cap × 2. Used for the credits check and the pull's budget. */
  max: number;
};

/** Expected = credits the same brand × platform used in the last successful pull (or the default). */
export function estimate(
  tasks: TaskKey[],
  lastCredits: Map<string, number>,
  pageCap: number,
): Estimate {
  const perPlatform = Object.fromEntries(
    PLATFORMS.map((p) => [p, { tasks: 0, expected: 0, max: 0 }]),
  ) as Estimate["perPlatform"];
  for (const t of tasks) {
    if (t.platform === "x") continue; // one combined search for all X brands: below
    const ceiling = taskPageCap(t.platform, pageCap) * CREDITS_PER_PAGE;
    const p = perPlatform[t.platform];
    p.tasks += 1;
    p.expected += Math.min(
      lastCredits.get(taskKey(t)) ?? DEFAULT_TASK_CREDITS[t.platform],
      ceiling,
    );
    p.max += ceiling;
  }
  // X (17g): one combined search (≤ 3 pages × 5) or, if it times out, one page per brand (5 each):
  // the ceiling is the larger of the two; expected = last time's X credits, else one page.
  const xTasks = tasks.filter((t) => t.platform === "x");
  if (xTasks.length) {
    const last = xTasks.reduce((n, t) => n + (lastCredits.get(taskKey(t)) ?? 0), 0);
    const max =
      Math.max(taskPageCap("x", pageCap), xTasks.length * X_SOLO_PAGE_CAP) * X_CREDITS_PER_PAGE;
    perPlatform.x = {
      tasks: xTasks.length,
      expected: Math.min(last || DEFAULT_TASK_CREDITS.x, max),
      max,
    };
  }
  const sum = (k: "expected" | "max") => PLATFORMS.reduce((n, p) => n + perPlatform[p][k], 0);
  return { perPlatform, expected: sum("expected"), max: sum("max") };
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

/**
 * Firecrawl's Retry-After header → seconds to wait (null if absent/unreadable). Accepts delta-seconds
 * ("12") or an HTTP date. Capped at 120 s so a bad header can't stall a pull for long.
 */
export function parseRetryAfter(
  header: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!header) return null;
  const value = header.trim();
  const seconds = /^\d+(\.\d+)?$/.test(value) ? Number(value) : (Date.parse(value) - nowMs) / 1000;
  if (!Number.isFinite(seconds)) return null;
  return Math.min(120, Math.max(1, Math.ceil(seconds)));
}

// ───────────────────────────────────────────── one running pull across all clients (17a)
export type RunningPull = {
  id: string;
  client_id: string;
  clients?: { name?: string } | null;
} | null;

/**
 * A pull is already running somewhere? Same client → follow it (`running` + its id, as before).
 * Another client → `other_running` with that client's name ("OBU is pulling right now. Try again in a few
 * minutes."): Firecrawl's free plan rate-limits parallel pulls. Null = free to start.
 */
export function runningConflict(running: RunningPull, clientId: string) {
  if (!running) return null;
  if (running.client_id === clientId) return { status: "running" as const, pullId: running.id };
  return {
    status: "other_running" as const,
    clientName: running.clients?.name?.trim() || "Another client",
  };
}

/**
 * Platforms a client tracks (Slice 17b): its `client_platforms` rows that are on AND supported here.
 * Rows for platforms 30reach can't pull yet (x, pinterest, youtube…) show "coming later" in the app and
 * count once supported. A client with no rows at all (shouldn't happen after 17a) tracks every platform,
 * so an older client never silently stops pulling.
 */
export function trackedPlatforms(
  rows: readonly { platform: string; state: string }[] | null | undefined,
): Platform[] {
  if (!rows || rows.length === 0) return PLATFORMS;
  const on = new Set(rows.filter((r) => r.state === "on").map((r) => r.platform));
  return PLATFORMS.filter((p) => on.has(p));
}

// ───────────────────────────────────────────── X (Slice 17g)
export const X_HANDLE = /^[a-z0-9_]{1,15}$/;

/** "@Ro", "x.com/ro", "twitter.com/ro?s=20" → "ro"; null when it isn't a handle. */
export function xHandle(input: string): string | null {
  let v = input.trim();
  const link = v.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?([^/?#]+)/i);
  if (link) v = link[1];
  v = v.replace(/^@/, "").toLowerCase();
  return X_HANDLE.test(v) && !["home", "search", "intent", "share", "i"].includes(v) ? v : null;
}

/**
 * The search for a pull: every brand's handle in one query, the window's first day, no replies, no reposts.
 * `(from:a OR from:b) since:2026-10-25 -filter:replies -filter:retweets`.
 */
export function xQuery(handles: readonly string[], sinceMs: number): string {
  const since = new Date(sinceMs).toISOString().slice(0, 10);
  const who =
    handles.length === 1
      ? `from:${handles[0]}`
      : `(${handles.map((h) => `from:${h}`).join(" OR ")})`;
  return `${who} since:${since} -filter:replies -filter:retweets`;
}

/** text, image, carousel (several photos) or video, from the post's media. */
export function xFormat(media: unknown): PostFormat {
  const list = Array.isArray(media) ? media.map(obj) : [];
  if (list.some((m) => m.type === "video" || m.type === "animated_gif")) return "video";
  const photos = list.filter((m) => m.type === "photo").length;
  return photos > 1 ? "carousel" : photos === 1 ? "image" : "text";
}

/** One AnyAPI twitter/search item → a post; replies and reposts ("RT @…") are dropped. */
export function mapXItem(item: unknown): MappedPost | null {
  const it = obj(item);
  const id = str(it.id);
  const text = typeof it.text === "string" ? it.text : "";
  if (!id || it.isReply === true || /^RT @/.test(text)) return null;
  const handle = str(it.authorUsername)?.toLowerCase() ?? null;
  const media = Array.isArray(it.media) ? it.media.map(obj) : [];
  const reposts = (num(it.retweetCount) ?? 0) + (num(it.quoteCount) ?? 0);
  return {
    platform: "x",
    external_id: id,
    // AnyAPI gives "x.com/i/web/status/<id>"; the author's link reads better and opens the same post.
    url: handle
      ? `https://x.com/${handle}/status/${id}`
      : (str(it.url) ?? `https://x.com/i/status/${id}`),
    posted_at: isoFromSeconds(it.createdUtc),
    posted_by: handle,
    format: xFormat(media),
    caption: text || null,
    hashtags: extractHashtags(text),
    likes: num(it.likeCount),
    comments: num(it.replyCount),
    views: num(it.viewCount),
    shares: reposts,
    saves: num(it.bookmarkCount),
    counts_hidden: false,
    is_paid: false,
    is_collab: false,
    raw: {
      lang: it.lang ?? null,
      quoteCount: it.quoteCount ?? null,
      authorVerified: it.authorVerified ?? null,
    },
    thumbnail_source: str(media[0]?.url),
    pinned: false,
  };
}

/** A combined search's posts, split by author handle (lowercase) → each brand's posts. Others are dropped. */
export function splitByAuthor(posts: readonly MappedPost[], handles: ReadonlyMap<string, string>) {
  const out = new Map<string, MappedPost[]>();
  for (const p of posts) {
    const competitorId = p.posted_by ? handles.get(p.posted_by) : undefined;
    if (!competitorId) continue;
    out.set(competitorId, [...(out.get(competitorId) ?? []), p]);
  }
  return out;
}

/**
 * X search failures worth falling back to one search per brand: the combined OR query can time out
 * (504 deadline_exceeded, not charged; spike 24 Nov) or be refused for its length.
 */
export const xNeedsFallback = (code: string | null | undefined, httpStatus?: number) =>
  httpStatus === 504 ||
  httpStatus === 408 ||
  ["deadline_exceeded", "timeout", "query_too_long", "invalid_option"].includes(code ?? "");

/**
 * Competitors' X check (Slice 17g): ScrapeCreators x/user-posts (1 credit, also when the account doesn't
 * exist). A missing account answers `{ success: true, userId: null, message: "Account doesn't exist" }`
 * with no error object; an existing one answers with tweets (followers on each). The search can't tell a
 * missing account from a silent one, so the check uses this.
 */
export function parseXUserPosts(body: unknown): ProfileResult {
  const data = obj(obj(body).data);
  const item = Array.isArray(data.alexandria) ? obj(data.alexandria[0]) : null;
  const creditsCost = num(item?.creditsCost) ?? 0;
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
  const missing =
    ("userId" in page && page.userId === null) || /doesn.?t exist/i.test(str(page.message) ?? "");
  if (missing)
    return { kind: "error", code: "not_found", message: "Account doesn't exist", creditsCost };
  const tweets = Array.isArray(page.tweets) ? page.tweets : [];
  const followers = num(
    obj(obj(obj(obj(obj(tweets[0]).core).user_results).result).legacy).followers_count,
  );
  return { kind: "ok", followers, creditsCost };
}
