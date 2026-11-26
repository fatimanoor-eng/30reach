// Pure helpers for the AI Edge Functions (Slice 11): ask-blip, plan-month, check-claims, suggest-hooks.
// No Deno APIs here, so Vitest can test them (ai-logic.test.ts).
//
// Rules this file enforces (CLAUDE.md, AI_PROMPTS.md):
// - Never send raw pulls: the model gets a compact summary (counts, averages, ~25 top posts with
//   short captions). Posts are referred to as p1…pN; real ids never leave the server.
// - Validate every JSON answer by hand (no zod). Anything off-shape → null → the caller retries once.
// - No emojis in text that becomes idea text, card titles or hooks.

import { parseRetryAfter, type Platform, PLATFORMS } from "./pull-logic.ts";

export { type Platform, PLATFORMS };

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Size limits. They keep every request well under Groq's 8K tokens/minute. */
export const LIMITS = {
  question: 500,
  /** Light mode (no data summary) only for questions this short. The browser decides; we cap it. */
  lightChars: 40,
  /** Smart Blip round 1: up to 6 turns, within historyBudget (oldest dropped first). */
  historyTurns: 6,
  historyChars: 600,
  /** All turns together, ≈ 600 tokens. The last 2 keep their full answers; older ones their first line. */
  historyBudget: 2_400,
  /** Follow-up chips: at most 3, each this long. */
  followUps: 3,
  followUpChars: 60,
  /** ≈ 2.5K tokens at ~4 chars/token. */
  summaryChars: 10_000,
  topPosts: 25,
  topPerBrand: 2,
  captionChars: 120,
  hashtags: 10,
  boardIdeas: 15,
  ideaNoteChars: 100,
  events: 40,
  eventName: 80,
  fieldChars: 1200,
  draftChars: 2400,
  hookContextPosts: 5,
  hookChars: 100,
  titleChars: 60,
  reasonChars: 140,
  whyChars: 140,
  planIdeas: 6,
} as const;

/**
 * LinkedIn (Slice 15c): text, image (one or more), document, video, article (a link post), poll.
 * Facebook (Slice 16c): reel, video, image, carousel (an album), article (a link post), text.
 * YouTube (Slice 18): video or short.
 */
export type Format =
  "reel" | "carousel" | "image" | "video" | "text" | "document" | "article" | "poll" | "short";

export const FORMATS_BY_PLATFORM: Record<Platform, Format[]> = {
  instagram: ["reel", "carousel", "image"],
  tiktok: ["video", "carousel"],
  linkedin: ["text", "image", "document", "video", "article", "poll"],
  facebook: ["reel", "video", "image", "carousel", "article", "text"],
  // X (17g): a post with no media, one photo, several photos or a video.
  x: ["text", "image", "video", "carousel"],
  // YouTube (18): a regular video or a Short.
  youtube: ["video", "short"],
};
/** Every format any platform has (Plan {month}'s JSON schema enum). */
export const ALL_FORMATS: Format[] = [...new Set(Object.values(FORMATS_BY_PLATFORM).flat())];
const FORMAT_LABEL: Record<Format, string> = {
  reel: "Reels",
  carousel: "Carousels",
  image: "Images",
  video: "Videos",
  text: "Text posts",
  document: "Documents",
  article: "Link posts",
  poll: "Polls",
  short: "Shorts",
};
const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
  youtube: "YouTube",
};

// ───────────────────────────────────────────── small helpers
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => isStr(v) && UUID.test(v);
const round = (n: number) => Math.round(n);
/** Growth since the previous pull, only when both pulls really read the count (same rule as the app). */
export function followersChange(
  data: Pick<PullData, "followers" | "previousFollowers">,
  competitorId: string,
  platform: Platform,
): number | null {
  if (platform === "facebook") return null;
  const find = (list: readonly Followers[] | undefined) =>
    list?.find((f) => f.competitor_id === competitorId && f.platform === platform);
  const now = find(data.followers);
  const before = find(data.previousFollowers);
  if (!now || !before || now.error_code === "carried" || before.error_code === "carried")
    return null;
  return now.followers !== null && before.followers !== null
    ? now.followers - before.followers
    : null;
}

/** Brand label → its full name (when a short name is shown) and aliases; null when nobody has any. */
export function alsoCalled(brands: readonly SummaryBrand[]): Record<string, string[]> | null {
  const out: Record<string, string[]> = {};
  for (const b of brands) {
    const label = b.short_name?.trim() || b.name;
    const names = [label !== b.name ? b.name : "", ...(b.aliases ?? [])]
      .map((n) => n.trim())
      .filter((n, i, all) => n && n !== label && all.indexOf(n) === i)
      .slice(0, 4);
    if (names.length) out[label] = names;
  }
  return Object.keys(out).length ? out : null;
}

/** 2 decimals, for small percentages (0.35). */
const round2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Collapses whitespace and trims. */
export const squish = (s: string) => s.replace(/\s+/g, " ").trim();

/** Cuts at a word boundary and adds "…" when it had to cut. */
export function clip(s: string, max: number): string {
  const t = squish(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** Removes emoji (and their joiners / variation selectors). For idea text, titles and hooks. */
export function stripEmoji(s: string): string {
  // Alternation, not one character class: joiners/selectors in a class trip no-misleading-character-class.
  return squish(
    s.replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}/gu, ""),
  );
}

/** "Fatima Noor" → "Fatima"; falls back to the email's local part; null if neither. */
export function firstName(
  fullName: string | null | undefined,
  email?: string | null,
): string | null {
  const fromName = fullName?.trim().split(/\s+/)[0];
  if (fromName) return clip(fromName, 30);
  const local = email?.split("@")[0]?.split(/[._-]/)[0];
  return local ? clip(local.charAt(0).toUpperCase() + local.slice(1), 30) : null;
}

const EASTERN_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  day: "numeric",
  month: "short",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const ISO_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
/**
 * Today for the prompts (US Eastern, the team's time): "Thursday 19 November 2026", so the model
 * never guesses the year (a hook once said "your 2023 journey").
 */
export function todayContext(now: Date = new Date()): { iso: string; label: string; year: number } {
  const iso = ISO_DAY.format(now);
  return { iso, label: LONG_DATE.format(now).replace(",", ""), year: Number(iso.slice(0, 4)) };
}

/** "9 Nov" (US Eastern). */
export const dayMonth = (iso: string) => DAY_MONTH.format(new Date(iso));
/** "17 Nov 2026" (US Eastern). */
export const dayMonthYear = (iso: string) => DAY_MONTH_YEAR.format(new Date(iso));

/** Same day parts as the Social page (social-metrics.ts), US Eastern. */
type DayPart = "morning" | "midday" | "afternoon" | "evening" | "night";
function dayPart(hour: number): DayPart {
  if (hour >= 6 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}
/** "Tue evening" for a post time (US Eastern). */
export function slotOf(iso: string): string {
  const parts = EASTERN_PARTS.formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  return `${weekday} ${dayPart(hour)}`;
}

// ───────────────────────────────────────────── compact summary
export type SummaryPost = {
  id: string;
  competitor_id: string;
  platform: Platform;
  external_id: string;
  url: string;
  posted_at: string | null;
  format: Format | null;
  caption: string | null;
  hashtags: string[] | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  /** LinkedIn reposts, Facebook / TikTok shares; null for Instagram. */
  shares: number | null;
  counts_hidden: boolean;
};
export type SummaryBrand = {
  id: string;
  name: string;
  /** 27 Nov: shown in the summary when set ("ABCU"); other names go in also_called. */
  short_name?: string | null;
  aliases?: string[] | null;
};
export type Followers = {
  competitor_id: string;
  platform: Platform;
  followers: number | null;
  /** "carried": copied from an earlier pull, not read this time (18b). */
  error_code?: string | null;
};
export type PullData = {
  clientName: string;
  brands: SummaryBrand[];
  /** carried (18b): platforms copied from an older pull → the date their data comes from. */
  pull: { id: string; started_at: string; carried?: Partial<Record<Platform, string>> | null };
  posts: SummaryPost[];
  followers: Followers[];
  /** The previous pull's readings (Smart Blip round 1: followers_change). */
  previousFollowers?: Followers[];
  previous: { id: string; started_at: string; posts: SummaryPost[] } | null;
};

const engagement = (p: SummaryPost) => (p.likes ?? 0) + (p.comments ?? 0);
const countable = (p: SummaryPost) => !p.counts_hidden;

/** Strongest weekday + day part by avg engagement; needs ≥ 2 posts (no single viral post). */
export function bestSlot(posts: SummaryPost[]): string | null {
  const slots = new Map<string, number[]>();
  for (const p of posts.filter(countable)) {
    if (!p.posted_at) continue;
    const key = slotOf(p.posted_at);
    slots.set(key, [...(slots.get(key) ?? []), engagement(p)]);
  }
  const best = [...slots]
    .filter(([, list]) => list.length >= 2)
    .map(([key, list]) => ({ key, avg: avg(list) }))
    .sort((a, b) => b.avg - a.avg)[0];
  return best?.key ?? null;
}

/** Format with the best avg engagement; needs ≥ 3 posts (same rule as the Overview KPI). */
export function bestFormat(posts: SummaryPost[]): Format | null {
  const by = new Map<Format, number[]>();
  for (const p of posts.filter(countable)) {
    if (!p.format) continue;
    by.set(p.format, [...(by.get(p.format) ?? []), engagement(p)]);
  }
  const best = [...by]
    .filter(([, list]) => list.length >= 3)
    .map(([f, list]) => ({ f, avg: avg(list) }))
    .sort((a, b) => b.avg - a.avg)[0];
  return best?.f ?? null;
}

export type Summary = {
  client: string;
  pull_date: string;
  /** 18b: platforms not pulled this time, with the date their data is from ("TikTok": "16 Nov 2026"). */
  older_data?: Record<string, string>;
  window_days: 30;
  time_zone: "US Eastern";
  engagement_means: typeof ENGAGEMENT_MEANS;
  total_posts: number;
  brands: {
    brand: string;
    platform: Platform;
    posts: number;
    small_sample: boolean;
    avg_likes: number;
    avg_comments: number;
    avg_views: number | null;
    /** LinkedIn only (left out elsewhere to keep the summary small). */
    avg_reposts?: number;
    /** Facebook only. */
    avg_shares?: number;
    followers: number | null;
    /** Avg engagement per post ÷ followers × 100 (26 Nov); null without a follower count. */
    engagement_rate_pct: number | null;
    /**
     * Followers gained (or lost) since the previous pull; null unless both pulls read the count (not carried
     * over, not Facebook, whose count is only read when the page is saved). Smart Blip round 1.
     */
    followers_change: number | null;
    formats: { format: Format; posts: number; avg_engagement: number }[];
    best_slot: string | null;
    new_since_previous: number | null;
  }[];
  top_posts: {
    ref: string;
    brand: string;
    platform: Platform;
    date: string | null;
    slot: string | null;
    format: Format | null;
    likes: number | null;
    comments: number | null;
    views: number | null;
    /** LinkedIn only. */
    reposts?: number;
    /** Facebook only. */
    shares?: number;
    caption: string;
  }[];
  top_hashtags: { tag: string; posts: number }[];
  previous: null | {
    pull_date: string;
    brands: { brand: string; platform: Platform; posts: number; avg_engagement: number }[];
  };
  /** 27 Nov: other names per brand label ("ABCU": ["Acme Business & Commerce University"]). */
  also_called?: Record<string, string[]>;
  not_in_data: string[];
};

/**
 * On LinkedIn and Facebook, `likes` holds all reactions (15c / 16c); a Facebook "carousel" is an album.
 * The rule lives here, in <data>, so Ask Blip's system prompt stays under its size budget.
 */
const ENGAGEMENT_MEANS =
  "likes + comments; on LinkedIn and Facebook likes = all reactions (say reactions); a Facebook carousel is an album. Compare brands within one platform. engagement_rate_pct = avg engagement per post ÷ followers × 100: use it to compare brands of different sizes (say 'engagement rate')";

/** Hard facts the model must not pretend to know. */
const NOT_IN_DATA = [
  "LinkedIn views and impressions",
  "Facebook views on photo, link and text posts",
  "Facebook posts beyond each brand's latest 12",
  "anything older than the 30-day window",
  "follower history before the previous pull",
  "the client's own posts",
  "ad spend, reach or impressions",
  "Instagram shares and saves",
  "posts from last year",
];

function brandStats(posts: SummaryPost[]) {
  const c = posts.filter(countable);
  const views = c.map((p) => p.views).filter((v): v is number => v != null);
  return {
    posts: posts.length,
    avg_likes: round(avg(c.map((p) => p.likes ?? 0))),
    avg_comments: round(avg(c.map((p) => p.comments ?? 0))),
    avg_views: views.length ? round(avg(views)) : null,
    avg_engagement: round(avg(c.map(engagement))),
    avg_shares: round(avg(c.map((p) => p.shares ?? 0))),
  };
}

/**
 * Top posts for the model: the best 2 per brand × platform first (so small brands are visible), then
 * the rest by engagement. Returns them in engagement order.
 */
export function pickTopPosts(posts: SummaryPost[], max: number = LIMITS.topPosts): SummaryPost[] {
  const ranked = posts.filter(countable).sort((a, b) => engagement(b) - engagement(a));
  const picked = new Set<SummaryPost>();
  const perGroup = new Map<string, number>();
  for (const p of ranked) {
    const key = `${p.competitor_id}|${p.platform}`;
    if ((perGroup.get(key) ?? 0) >= LIMITS.topPerBrand) continue;
    perGroup.set(key, (perGroup.get(key) ?? 0) + 1);
    picked.add(p);
  }
  for (const p of ranked) {
    if (picked.size >= max) break;
    picked.add(p);
  }
  return ranked.filter((p) => picked.has(p)).slice(0, max);
}

/**
 * The compact summary of the saved pull the model sees, plus `refs` (index i ↔ "p{i+1}" ↔ post id).
 * Shrinks itself (fewer top posts, then shorter captions) to stay under LIMITS.summaryChars.
 */
export function buildSummary(
  data: PullData,
  opts: { topPosts?: number; captionChars?: number } = {},
): { summary: Summary; refs: string[]; labels: string[]; json: string } {
  // Short names keep chips and answers readable (27 Nov); the full name and aliases go in also_called.
  const name = new Map(data.brands.map((b) => [b.id, b.short_name?.trim() || b.name]));
  const brandName = (id: string) => name.get(id) ?? "Unknown";
  const prevIds = data.previous ? new Set(data.previous.posts.map((p) => p.external_id)) : null;

  const groups = new Map<string, SummaryPost[]>();
  for (const p of data.posts) {
    const key = `${p.competitor_id}|${p.platform}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const brands = [...groups].map(([key, posts]) => {
    const [competitorId, platform] = key.split("|") as [string, Platform];
    const s = brandStats(posts);
    const followers =
      data.followers.find((f) => f.competitor_id === competitorId && f.platform === platform)
        ?.followers ?? null;
    const formats = (Object.keys(FORMAT_LABEL) as Format[])
      .map((f) => {
        const fp = posts.filter((p) => p.format === f);
        return { format: f, posts: fp.length, avg_engagement: brandStats(fp).avg_engagement };
      })
      .filter((f) => f.posts > 0);
    return {
      brand: brandName(competitorId),
      platform,
      posts: s.posts,
      small_sample: s.posts < 10,
      avg_likes: s.avg_likes,
      avg_comments: s.avg_comments,
      avg_views: s.avg_views,
      ...(platform === "linkedin" && { avg_reposts: s.avg_shares }),
      ...(platform === "facebook" && { avg_shares: s.avg_shares }),
      ...(platform === "x" && { avg_reposts: s.avg_shares }),
      followers,
      engagement_rate_pct: followers ? round2((s.avg_engagement / followers) * 100) : null,
      followers_change: followersChange(data, competitorId, platform),
      formats,
      best_slot: bestSlot(posts),
      new_since_previous: prevIds ? posts.filter((p) => !prevIds.has(p.external_id)).length : null,
    };
  });
  brands.sort((a, b) => a.brand.localeCompare(b.brand) || a.platform.localeCompare(b.platform));

  const tagCount = new Map<string, number>();
  for (const p of data.posts)
    for (const t of new Set(p.hashtags ?? [])) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const top_hashtags = [...tagCount]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, LIMITS.hashtags)
    .map(([tag, posts]) => ({ tag, posts }));

  let previous: Summary["previous"] = null;
  if (data.previous) {
    const pg = new Map<string, SummaryPost[]>();
    for (const p of data.previous.posts) {
      const key = `${p.competitor_id}|${p.platform}`;
      pg.set(key, [...(pg.get(key) ?? []), p]);
    }
    previous = {
      pull_date: dayMonthYear(data.previous.started_at),
      brands: [...pg]
        .map(([key, posts]) => {
          const [competitorId, platform] = key.split("|") as [string, Platform];
          const s = brandStats(posts);
          return {
            brand: brandName(competitorId),
            platform,
            posts: s.posts,
            avg_engagement: s.avg_engagement,
          };
        })
        .sort((a, b) => a.brand.localeCompare(b.brand) || a.platform.localeCompare(b.platform)),
    };
  }

  const maxTop = opts.topPosts ?? LIMITS.topPosts;
  const captionChars = opts.captionChars ?? LIMITS.captionChars;
  const top = pickTopPosts(data.posts, maxTop);
  const summary: Summary = {
    client: data.clientName,
    pull_date: dayMonthYear(data.pull.started_at),
    ...(data.pull.carried && Object.keys(data.pull.carried).length
      ? {
          older_data: Object.fromEntries(
            Object.entries(data.pull.carried).map(([p, d]) => [
              PLATFORM_LABEL[p as Platform] ?? p,
              dayMonthYear(d as string),
            ]),
          ),
        }
      : {}),
    window_days: 30,
    time_zone: "US Eastern",
    engagement_means: ENGAGEMENT_MEANS,
    total_posts: data.posts.length,
    brands,
    top_posts: top.map((p, i) => ({
      ref: `p${i + 1}`,
      brand: brandName(p.competitor_id),
      platform: p.platform,
      date: p.posted_at ? dayMonth(p.posted_at) : null,
      slot: p.posted_at ? slotOf(p.posted_at) : null,
      format: p.format,
      likes: p.likes,
      comments: p.comments,
      views: p.views,
      ...(p.platform === "linkedin" && { reposts: p.shares ?? 0 }),
      ...(p.platform === "facebook" && { shares: p.shares ?? 0 }),
      ...(p.platform === "x" && { reposts: p.shares ?? 0 }),
      caption: clip(stripEmoji(p.caption ?? ""), captionChars),
    })),
    top_hashtags,
    previous,
    ...(alsoCalled(data.brands) ? { also_called: alsoCalled(data.brands)! } : {}),
    not_in_data: NOT_IN_DATA,
  };
  const json = JSON.stringify(summary);
  if (json.length > LIMITS.summaryChars) {
    if (maxTop > 10) return buildSummary(data, { topPosts: maxTop - 5, captionChars });
    if (captionChars > 60) return buildSummary(data, { topPosts: maxTop, captionChars: 60 });
  }
  return {
    summary,
    refs: top.map((p) => p.id),
    labels: top.map((p) => refLabel(brandName(p.competitor_id), p.format, p.posted_at)),
    json,
  };
}

/** "p3" / "post:p3" / "[post:p3]" → the real post id, or null. */
export function refToId(ref: string, refs: string[]): string | null {
  const m = /^\[?(?:post:)?p(\d{1,3})\]?$/i.exec(ref.trim());
  if (!m) return null;
  return refs[Number(m[1]) - 1] ?? null;
}

// ───────────────────────────────────────────── post refs (p1…pN) never reach the screen

/** How a format reads in a sentence ("Hims’ link post"); LinkedIn's "text" is just a post. */
const REF_WORD: Record<string, string> = { text: "post", article: "link post" };

/** "Ro’s reel from 9 Nov", "Hims’ video from 2 Nov", "Found’s post" (what a ref means to a person). */
export function refLabel(brand: string, format: string | null, postedAt: string | null): string {
  const owner = /s$/i.test(brand) ? `${brand}’` : `${brand}’s`;
  const what = format ? (REF_WORD[format] ?? format) : "post";
  return `${owner} ${what}${postedAt ? ` from ${dayMonth(postedAt)}` : ""}`;
}

/** A citation group: "[p3]", "[post:p3, p5]", "(p2)", "(p1 and p4)". Removed: the sources list shows them. */
const CITE_GROUP =
  /\s*[[(]\s*(?:post:?\s*)?p\d{1,3}(?:\s*(?:,|and|&)\s*(?:post:?\s*)?p\d{1,3})*\s*[\])]/gi;
/** A ref inside a sentence: "p3", "post p3", "post:p3". */
const BARE_REF = /\b(?:post:?\s*)?p(\d{1,3})\b/gi;

/** Every ref a text mentions, bracketed or not ("p3"), for citations. */
const refsIn = (s: string) => [...s.matchAll(/\bp(\d{1,3})\b/gi)].map((m) => `p${m[1]}`);

/**
 * Text with no internal refs: citation groups go, refs inside a sentence become what they are
 * ("p3 got 9.8K likes" → "Ro’s reel from 9 Nov got 9.8K likes"; unknown → "a top post").
 */
export function humanizeRefs(text: string, labels: string[]): string {
  return text
    .replace(CITE_GROUP, "")
    .replace(BARE_REF, (_m, n: string) => labels[Number(n) - 1] ?? "a top post")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Engagement-ranked: the "30reach looked at" chips on 10 come from code, never the model. */
export function planFacts(posts: SummaryPost[], eventCount: number, boardIdeas: number) {
  const f = bestFormat(posts);
  return {
    events: eventCount,
    bestFormat: f ? FORMAT_LABEL[f] : null,
    bestTime: bestSlot(posts),
    boardIdeas,
  };
}

// ───────────────────────────────────────────── health red flags (code, not AI)
/**
 * A small, conservative list that always runs (even if the model misses it). The model's check
 * catches the rest. Advisory only. Returns the exact matched text from `text`.
 */
const RED_FLAGS: [RegExp, string][] = [
  [/\bguarantee[sd]?\b/i, "Promises a result."],
  [/\bcure[sd]?\b/i, "Sounds like a medical claim."],
  [/\b(?:lose|drop|shed)\s+\d+\s*(?:lbs?|pounds?|kgs?|kilos?)\b/i, "Promises weight loss."],
  [
    /\b\d+\s*(?:lbs?|pounds?|kgs?)\s+in\s+\d+\s*(?:days?|weeks?|months?)\b/i,
    "Promises weight loss.",
  ],
  [/\bmelts?\s+(?:away\s+)?(?:belly\s+)?fat\b/i, "Promises weight loss."],
  [/\bmiracle\b/i, "Hype that implies results."],
  [/\bskyrocket(?:s|ing)?\b/i, "Hype word."],
  [/\bgame[- ]?changer\b/i, "Hype word."],
  [/\bguilt[- ]free\b/i, "Food guilt framing."],
  [/\b(?:cheat|junk)\s+(?:meals?|days?|foods?)\b/i, "Food guilt framing."],
  [/\b(?:bikini|beach)\s+body\b/i, "Body shaming."],
];

export type Issue = { quote: string; why: string };

export function healthRedFlags(text: string): Issue[] {
  const out: Issue[] = [];
  const spans: [number, number][] = [];
  for (const [re, why] of RED_FLAGS) {
    const m = re.exec(text);
    if (!m) continue;
    const [a, b] = [m.index, m.index + m[0].length];
    // One phrase is reported once ("Lose 10 lbs in 2 weeks" matches two patterns).
    if (spans.some(([x, y]) => a < y && x < b)) continue;
    spans.push([a, b]);
    out.push({ quote: m[0], why });
  }
  return out;
}

// ───────────────────────────────────────────── Groq response + rate-limit headers
export type GroqMeter = {
  model: string;
  remaining_requests: number | null;
  limit_requests: number | null;
  remaining_tokens: number | null;
  limit_tokens: number | null;
  reset_requests: string | null;
  reset_tokens: string | null;
};

type HeaderBag = { get(name: string): string | null };
const num = (v: string | null) => (v != null && /^\d+$/.test(v.trim()) ? Number(v) : null);

/** Groq's x-ratelimit-* headers (requests = per day, tokens = per minute). Null if none are there. */
export function parseGroqMeter(h: HeaderBag, model: string): GroqMeter | null {
  const meter: GroqMeter = {
    model,
    remaining_requests: num(h.get("x-ratelimit-remaining-requests")),
    limit_requests: num(h.get("x-ratelimit-limit-requests")),
    remaining_tokens: num(h.get("x-ratelimit-remaining-tokens")),
    limit_tokens: num(h.get("x-ratelimit-limit-tokens")),
    reset_requests: h.get("x-ratelimit-reset-requests"),
    reset_tokens: h.get("x-ratelimit-reset-tokens"),
  };
  return meter.remaining_requests == null && meter.remaining_tokens == null ? null : meter;
}

/**
 * The chat completion request. Every param is one Groq documents for gpt-oss: strict json_schema
 * (all properties required, additionalProperties false), reasoning_effort low|medium|high,
 * include_reasoning false (reasoning_format isn't supported on gpt-oss, so it's never sent). No
 * streaming or tools: Groq doesn't support them with Structured Outputs.
 *
 * mode "json_object" is the fallback after a strict json_validate_failed: valid JSON, no schema (the
 * prompts carry complete examples, and our validators fill missing keys). Groq needs the word
 * "JSON" in the messages for it; every system prompt has it (tested).
 */
export type GroqMode = "strict" | "json_object";
export function groqRequestBody(o: {
  model: string;
  system: string;
  user: string;
  schema: { name: string; schema: Record<string, unknown> };
  maxTokens: number;
  mode?: GroqMode;
}) {
  return {
    model: o.model,
    temperature: 0.3,
    // Reasoning tokens count here too: too small and Groq can't finish the JSON (400).
    max_completion_tokens: o.maxTokens,
    reasoning_effort: "low",
    include_reasoning: false,
    response_format:
      o.mode === "json_object"
        ? { type: "json_object" }
        : { type: "json_schema", json_schema: { ...o.schema, strict: true } },
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: o.user },
    ],
  };
}

/** Groq's error code ("json_validate_failed"), or null. */
export function groqErrorCode(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    return isObj(parsed) && isObj(parsed.error) && isStr(parsed.error.code)
      ? parsed.error.code
      : null;
  } catch {
    return null;
  }
}

/**
 * After a Groq HTTP error: the mode for ONE more try, or null for "give up". Only a strict-mode
 * json_validate_failed (400) on the first attempt is retried, in json_object mode. Every other
 * error would fail the same way again.
 */
export function retryModeAfter(
  status: number,
  body: string,
  attempt: number,
  mode: GroqMode,
): GroqMode | null {
  return status === 400 &&
    attempt === 1 &&
    mode === "strict" &&
    groqErrorCode(body) === "json_validate_failed"
    ? "json_object"
    : null;
}

/**
 * Groq's error body as one safe log line: status, code, type, param and message (key-like strings
 * masked, max 300 chars), and only the LENGTH of failed_generation (model output can echo our data).
 * Never the prompt. "ask-blip full · Groq HTTP 400 · json_validate_failed (invalid_request_error): …"
 */
export function groqErrorLog(label: string, status: number, body: string): string {
  let err: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(body);
    if (isObj(parsed) && isObj(parsed.error)) err = parsed.error;
  } catch {
    /* not JSON: logged as a length only */
  }
  const mask = (t: string) =>
    t.replace(/gsk_[A-Za-z0-9]+/g, "gsk_…").replace(/Bearer\s+\S+/gi, "Bearer …");
  const str = (v: unknown) => (isStr(v) && v.trim() ? mask(v.trim()) : null);
  const code = str(err.code);
  const type = str(err.type);
  const param = str(err.param);
  const message = str(err.message);
  const failed = isStr(err.failed_generation) ? err.failed_generation.length : null;
  return [
    `${label} · Groq HTTP ${status}`,
    code || type ? ` · ${code ?? "?"}${type ? ` (${type})` : ""}` : "",
    param ? ` · param ${param}` : "",
    message ? `: ${clip(message, 300)}` : ` · ${body.length} chars, not a Groq error object`,
    failed != null ? ` · failed_generation ${failed} chars` : "",
  ].join("");
}

/**
 * One log line per Groq response, for tuning against the free plan's tokens per minute:
 * "ask-blip light · tokens 412 in + 96 out (reasoning 40) = 508 · 7.4K/min left". Never the content.
 */
export function tokenLog(label: string, body: unknown, h: HeaderBag): string {
  const usage = isObj(body) && isObj(body.usage) ? body.usage : {};
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  const details = isObj(usage.completion_tokens_details) ? usage.completion_tokens_details : {};
  const reasoning = n(details.reasoning_tokens);
  const left = num(h.get("x-ratelimit-remaining-tokens"));
  return [
    `${label} · tokens ${n(usage.prompt_tokens) ?? "?"} in + ${n(usage.completion_tokens) ?? "?"} out`,
    reasoning != null ? ` (reasoning ${reasoning})` : "",
    ` = ${n(usage.total_tokens) ?? "?"}`,
    left != null ? ` · ${left} tokens/min left` : "",
  ].join("");
}

/** Seconds to wait after a 429 (Retry-After, capped at 120 s), else 60. */
export const groqRetryAfter = (h: HeaderBag) => parseRetryAfter(h.get("retry-after")) ?? 60;

/**
 * Chat completion body → the parsed JSON content. Null if it's cut off (finish_reason "length"),
 * empty or not JSON.
 */
export function parseGroqJson(body: unknown): unknown | null {
  const choice = isObj(body) && Array.isArray(body.choices) ? body.choices[0] : null;
  if (!isObj(choice) || choice.finish_reason === "length") return null;
  const content = isObj(choice.message) ? choice.message.content : null;
  if (!isStr(content) || !content.trim()) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────── JSON schemas (Groq strict mode)
// Strict mode: every property required, additionalProperties false. Lengths are checked in code.
const strictObject = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const strArray = { type: "array", items: { type: "string" } };

/**
 * One flat object for both reply types (strict mode needs every field anyway, and avoids relying on
 * anyOf support): "insight" fills lead…in_data and leaves message ""; "chat" fills message only.
 */
export const ASK_SCHEMA = {
  name: "blip_answer",
  schema: strictObject({
    type: { type: "string", enum: ["insight", "chat", "general"] },
    message: { type: "string" },
    tie_back: { type: "string" },
    may_be_outdated: { type: "boolean" },
    lead: { type: "string" },
    points: strArray,
    for_client: { type: "string" },
    post_refs: strArray,
    in_data: { type: "boolean" },
    follow_ups: strArray,
  }),
};

/** Light mode (no data sent): chat only. */
export const ASK_LIGHT_SCHEMA = {
  name: "blip_chat",
  schema: strictObject({
    type: { type: "string", enum: ["chat", "general"] },
    message: { type: "string" },
    tie_back: { type: "string" },
    may_be_outdated: { type: "boolean" },
  }),
};

export const PLAN_SCHEMA = {
  name: "month_plan",
  schema: strictObject({
    ideas: {
      type: "array",
      items: strictObject({
        date: { type: "string" },
        platform: { type: "string", enum: PLATFORMS },
        format: { type: "string", enum: ALL_FORMATS },
        title: { type: "string" },
        reason: { type: "string" },
        source_refs: strArray,
      }),
    },
  }),
};

export const CLAIMS_SCHEMA = {
  name: "claim_check",
  schema: strictObject({
    status: { type: "string", enum: ["clear", "flagged"] },
    issues: {
      type: "array",
      items: strictObject({ quote: { type: "string" }, why: { type: "string" } }),
    },
  }),
};

export const HOOKS_SCHEMA = {
  name: "hooks",
  schema: strictObject({ hooks: strArray }),
};

export const CAPTIONS_SCHEMA = {
  name: "captions",
  schema: strictObject({ captions: strArray }),
};

// ───────────────────────────────────────────── inputs (from the browser)
export type InputError = { error: string };
const bad = (error: string): InputError => ({ error });
const optText = (v: unknown, max: number) => (isStr(v) ? v.trim().slice(0, max) : "");

export type AskInput = {
  clientId: string;
  question: string;
  history: { q: string; a: string }[];
  /** Small talk: persona + rules + last turns only, no data summary (~400 tokens instead of ~3K). */
  light: boolean;
};
/**
 * Conversation memory (Smart Blip round 1): the last 6 turns. The 2 newest keep their answers (≤ 600
 * chars); older answers shrink to their first line (≤ 160). Then the oldest turns go until everything fits
 * LIMITS.historyBudget (≈ 600 tokens), so a long chat never pushes a request past Groq's 8K a minute.
 */
export function trimHistory(
  turns: readonly { q: string; a: string }[],
): { q: string; a: string }[] {
  const recent = turns.slice(-LIMITS.historyTurns);
  const shaped = recent.map((t, i) => {
    const old = i < recent.length - 2;
    const a = old ? (t.a.split("\n")[0] ?? "") : t.a;
    return { q: clip(t.q, old ? 200 : 300), a: clip(a, old ? 160 : LIMITS.historyChars) };
  });
  const size = (list: { q: string; a: string }[]) =>
    list.reduce((n, t) => n + t.q.length + t.a.length, 0);
  while (shaped.length > 1 && size(shaped) > LIMITS.historyBudget) shaped.shift();
  return shaped;
}

export function parseAskInput(body: Record<string, unknown>): AskInput | InputError {
  if (!isUuid(body.clientId)) return bad("bad_client");
  const question = isStr(body.question) ? squish(body.question) : "";
  if (!question) return bad("empty_question");
  if (question.length > LIMITS.question) return bad("question_too_long");
  const history = trimHistory(
    (Array.isArray(body.history) ? body.history : []).filter(
      (t): t is { q: string; a: string } => isObj(t) && isStr(t.q) && isStr(t.a),
    ),
  );
  const light = body.light === true && question.length <= LIMITS.lightChars;
  return { clientId: body.clientId, question, history, light };
}

export type PlanEvent = { date: string; name: string; kind: "holiday" | "marketing" | "health" };
export type PlanInput = {
  clientId: string;
  month: string;
  events: PlanEvent[];
  /** Round 3: how many ideas (6 / 10 / 15; the browser suggests one from competitors' rhythm). */
  count: PlanCount;
  /** The platforms the client tracks, to spread the ideas over ([] = the ones in the pull). */
  platforms: Platform[];
};

export const PLAN_COUNTS = [6, 10, 15] as const;
export type PlanCount = (typeof PLAN_COUNTS)[number];

/**
 * Competitors' posting rhythm per platform (round 3): the median brand's posts per week over the 30-day
 * window. Platforms with no posts get 0.
 */
export function platformCadence(
  posts: readonly Pick<SummaryPost, "competitor_id" | "platform">[],
  platforms: readonly Platform[],
  days = 30,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of platforms) {
    const per = new Map<string, number>();
    for (const x of posts)
      if (x.platform === p) per.set(x.competitor_id, (per.get(x.competitor_id) ?? 0) + 1);
    const counts = [...per.values()].sort((a, b) => a - b);
    const median = counts.length
      ? counts.length % 2
        ? counts[(counts.length - 1) / 2]
        : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2
      : 0;
    out[p] = Math.round((median / (days / 7)) * 10) / 10;
  }
  return out;
}

/**
 * Spread `count` ideas over the platforms by competitors' rhythm (largest remainder), at least one each
 * when there are enough ideas; platforms nobody posts on still get one (the client may post there).
 */
export function planShares(
  count: number,
  platforms: readonly Platform[],
  cadence: Record<string, number>,
): { platform: Platform; ideas: number }[] {
  if (!platforms.length) return [];
  const weight = (p: Platform) => Math.max(cadence[p] ?? 0, 0.5);
  const total = platforms.reduce((s, p) => s + weight(p), 0);
  const base = platforms.map((p) => ({
    platform: p,
    ideas: 0,
    exact: (count * weight(p)) / total,
  }));
  const min = count >= platforms.length ? 1 : 0;
  for (const b of base) b.ideas = Math.max(min, Math.floor(b.exact));
  let left = count - base.reduce((s, b) => s + b.ideas, 0);
  const byRemainder = [...base].sort(
    (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
  );
  for (let i = 0; left > 0; i = (i + 1) % byRemainder.length, left--) byRemainder[i].ideas++;
  // Too many after the minimums: take back from the biggest.
  while (left < 0) {
    const big = [...base].sort((a, b) => b.ideas - a.ideas)[0];
    big.ideas--;
    left++;
  }
  return base.filter((b) => b.ideas > 0).map(({ platform, ideas }) => ({ platform, ideas }));
}
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A month from this month up to 3 months ahead ("2027-01"). `today` = "YYYY-MM-DD". */
export function parsePlanInput(
  body: Record<string, unknown>,
  today: string,
): PlanInput | InputError {
  if (!isUuid(body.clientId)) return bad("bad_client");
  if (!isStr(body.month) || !MONTH.test(body.month)) return bad("bad_month");
  const [y, m] = body.month.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  const diff = (y - ty) * 12 + (m - tm);
  if (diff < 0 || diff > 3) return bad("bad_month");
  const month = body.month;
  const events = (Array.isArray(body.events) ? body.events : [])
    .filter(
      (e): e is PlanEvent =>
        isObj(e) &&
        isStr(e.date) &&
        DATE.test(e.date) &&
        e.date.startsWith(`${month}-`) &&
        isStr(e.name) &&
        ["holiday", "marketing", "health"].includes(e.kind as string),
    )
    .slice(0, LIMITS.events)
    .map((e) => ({ date: e.date, name: clip(e.name, LIMITS.eventName), kind: e.kind }));
  const count = (PLAN_COUNTS as readonly number[]).includes(Number(body.count))
    ? (Number(body.count) as PlanCount)
    : 6;
  const platforms = (Array.isArray(body.platforms) ? body.platforms : [])
    .filter((p): p is Platform => PLATFORMS.includes(p as Platform))
    .filter((p, i, all) => all.indexOf(p) === i);
  return { clientId: body.clientId, month, events, count, platforms };
}

export type ClaimsInput = { cardId: string; draft: string };
/** Title / hook / caption / visual idea → one labelled draft. Error if there's nothing to check. */
export function parseClaimsInput(body: Record<string, unknown>): ClaimsInput | InputError {
  if (!isUuid(body.cardId)) return bad("bad_card");
  const parts: [string, string][] = [
    ["Title", optText(body.title, 200)],
    ["Hook", optText(body.hook, LIMITS.fieldChars)],
    ["Caption", optText(body.caption, LIMITS.fieldChars)],
    ["Visual idea", optText(body.visualIdea, LIMITS.fieldChars)],
  ];
  const draft = parts
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")
    .slice(0, LIMITS.draftChars);
  return draft ? { cardId: body.cardId, draft } : bad("nothing_to_check");
}

export type HooksInput = {
  clientId: string;
  title: string;
  caption: string;
  platform: Platform | null;
  format: Format | null;
};
export function parseHooksInput(body: Record<string, unknown>): HooksInput | InputError {
  if (!isUuid(body.clientId)) return bad("bad_client");
  const title = optText(body.title, 200);
  const caption = optText(body.caption, LIMITS.fieldChars);
  if (!title && !caption) return bad("nothing_to_use");
  const platform = PLATFORMS.includes(body.platform as Platform)
    ? (body.platform as Platform)
    : null;
  const format =
    platform && FORMATS_BY_PLATFORM[platform].includes(body.format as Format)
      ? (body.format as Format)
      : null;
  return { clientId: body.clientId, title, caption, platform, format };
}

// ───────────────────────────────────────────── output validators
export type AskInsight = {
  type: "insight";
  lead: string;
  points: string[];
  forClient: string;
  postIds: string[];
  inData: boolean;
  /** 0–3 next questions about this answer, shown as chips (Smart Blip round 1). */
  followUps: string[];
};
/**
 * Small talk (greetings, hype, thanks, feelings, off-topic): 1–2 sentences, then back to the data. A
 * general question (round 2: "what is a carousel?") is a chat too, from the model's own knowledge, with a
 * tie-back to the client's data and a flag when the answer may be out of date.
 */
export type AskChat = {
  type: "chat";
  message: string;
  /** One line linking back to the client's data (or, in light mode, a data question to ask). */
  tieBack?: string;
  /** Platform features, algorithms, numbers that change: "I may be out of date on this". */
  mayBeOutdated?: boolean;
};
export type AskAnswer = AskInsight | AskChat;

const cleanChat = (s: string, max: number, labels: string[] = []) =>
  clip(plainWords(humanizeRefs(s, labels)), max);

/** Field names Blip might echo from <data>, in plain words (27 Nov: "null" showed on a first pull). */
const FIELD_WORDS: Record<string, string> = {
  engagement_rate_pct: "engagement rate",
  followers_change: "follower change",
  avg_engagement: "average engagement",
  avg_likes: "average likes",
  avg_comments: "average comments",
  avg_views: "average views",
  avg_reposts: "average reposts",
  avg_shares: "average shares",
  small_sample: "small sample",
  best_slot: "best time",
  new_since_previous: "new posts",
  top_posts: "top posts",
  top_hashtags: "top hashtags",
  older_data: "earlier pull",
  not_in_data: "not in this pull",
  in_data: "in the data",
  pull_date: "pull date",
  total_posts: "posts",
  window_days: "days",
};

/**
 * Internal words never reach the person: field names become plain words, any other snake_case loses its
 * underscores, and "null" / "undefined" / "NaN" become "not available". Quoted JSON-ish bits lose quotes.
 */
export function plainWords(s: string): string {
  return s
    .replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (w) => FIELD_WORDS[w] ?? w.replace(/_/g, " "))
    .replace(/\b(?:is|was|are|were) (?:null|undefined)\b/gi, "isn’t available")
    .replace(/\b(?:null|undefined|NaN)\b/g, "not available")
    .replace(/"(previous|followers|older data|earlier pull)"/gi, "$1");
}

const EMOJI =
  /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\u{FE0F}|\u{200D}\p{Extended_Pictographic})*|\p{Regional_Indicator}{1,2}/gu;
/** Keeps the first `max` emoji (a ZWJ sequence or flag counts as one) and drops the rest. */
const EMOJI_SEQ = EMOJI;
export function capEmoji(s: string, max: number): string {
  let n = 0;
  return squish(s.replace(EMOJI, (m) => (++n <= max ? m : "")));
}

export const CHAT_CHARS = 280;
export const CHAT_EMOJI = 2;

/**
 * Ask Blip answer, lenient about the SHAPE and strict about the CONTENT. Missing or wrong-typed
 * fields get safe defaults ("" / [] / in_data = has points) instead of a rejection: Groq's strict
 * mode can still refuse an answer that leaves out a key (json_validate_failed), and the json_object
 * fallback has no schema at all. What each type needs:
 * - chat: a non-empty message (clipped, ≤ 2 emoji, no p-refs);
 * - insight: a non-empty lead and a points array (0 points is fine when the data can't answer).
 * A missing / unknown type is worked out from the content (lead → insight, message → chat).
 * Citations are mapped back to real post ids; unknown refs are dropped.
 */
export function validateAskAnswer(
  raw: unknown,
  refs: string[],
  labels: string[] = [],
): AskAnswer | null {
  if (!isObj(raw)) return null;
  const hasLead = isStr(raw.lead) && !!cleanChat(raw.lead, 300);
  const hasMessage = isStr(raw.message) && !!raw.message.trim();
  const type =
    (raw.type === "chat" || raw.type === "general") && (hasMessage || !hasLead)
      ? "chat"
      : raw.type === "insight" || hasLead
        ? "insight"
        : hasMessage
          ? "chat"
          : null;
  if (type === "chat") return validateLightAnswer(raw, labels);
  if (type !== "insight" || !hasLead || !Array.isArray(raw.points)) return null;
  const lead = cleanChat(raw.lead as string, 300, labels);
  const pointTexts = raw.points.filter(isStr);
  const points = pointTexts
    .map((p) => cleanChat(p, 400, labels))
    .filter(Boolean)
    .slice(0, 5);
  const forClient = isStr(raw.for_client) ? raw.for_client : "";
  const postRefs = Array.isArray(raw.post_refs) ? raw.post_refs.filter(isStr) : [];
  const cited = [...postRefs, ...[raw.lead as string, ...pointTexts, forClient].flatMap(refsIn)];
  const postIds = [
    ...new Set(cited.map((r) => refToId(r, refs)).filter((id): id is string => !!id)),
  ];
  return {
    type: "insight",
    lead,
    points,
    forClient: cleanChat(forClient, 300, labels),
    postIds: postIds.slice(0, 8),
    inData: typeof raw.in_data === "boolean" ? raw.in_data : points.length > 0,
    followUps: cleanFollowUps(raw.follow_ups, labels),
  };
}

/** Topics the pull can't answer: a chip about them would only lead to "that's not in the data". */
const UNANSWERABLE =
  /\b(last year|ad spend|ads?\b|reach|impressions|shares and saves|our own posts|client's own|budget|revenue|sales)\b/i;

/**
 * Follow-up chips: questions only (ends with "?"), ≤ 60 chars, no post refs, no duplicates, nothing the
 * data can't answer; at most 3. Anything else is dropped (the panel falls back to its usual starters).
 */
export function cleanFollowUps(raw: unknown, labels: string[] = []): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (!isStr(item)) continue;
    const text = squish(stripEmoji(humanizeRefs(item, labels)))
      .replace(/\[p\d+\]/gi, "")
      .trim();
    if (!text || !text.endsWith("?") || text.length > LIMITS.followUpChars) continue;
    if (UNANSWERABLE.test(text) || /\bp\d+\b/i.test(text)) continue;
    if (out.some((o) => o.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
    if (out.length === LIMITS.followUps) break;
  }
  return out;
}

/**
 * The new answer says the same as the last one (27 Nov: Blip repeated itself after a correction). Compares
 * the first line, normalised; short replies ("ok!") never count.
 */
export function repeatsLast(a: AskAnswer, history: readonly { a: string }[]): boolean {
  const last = history.at(-1)?.a;
  if (!last) return false;
  const norm = (s: string) =>
    s
      .split("\n")[0]
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const now = norm(a.type === "chat" ? a.message : a.lead);
  return now.length >= 20 && now === norm(last);
}

/** A chat reply (light mode, or type "chat"): clipped, ≤ 2 emoji, no p-refs. Empty → null (retry). */
export function validateLightAnswer(raw: unknown, labels: string[] = []): AskChat | null {
  if (!isObj(raw) || !isStr(raw.message)) return null;
  const general = raw.type === "general";
  // General answers get a little more room (2-3 sentences); small talk stays short.
  const message = capEmoji(
    cleanChat(raw.message, general ? GENERAL_CHARS : CHAT_CHARS, labels),
    CHAT_EMOJI,
  );
  if (!message) return null;
  const tieBack = isStr(raw.tie_back) ? capEmoji(cleanChat(raw.tie_back, 200, labels), 1) : "";
  return {
    type: "chat",
    message,
    ...(tieBack ? { tieBack } : {}),
    ...(raw.may_be_outdated === true ? { mayBeOutdated: true } : {}),
  };
}

/** A general-knowledge answer: 2–3 sentences. */
export const GENERAL_CHARS = 420;

/** "For OBU Health: try a weekly Q&A 🎯" → "Try a weekly Q&A" (the text saved as an AI idea). */
export function ideaFromAnswer(forClient: string, clientName: string): string {
  const prefix = new RegExp(
    `^for\\s+${clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:,-]\\s*`,
    "i",
  );
  const text = stripEmoji(forClient)
    .replace(prefix, "")
    .replace(/^for\s+\w+\s*:\s*/i, "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export type PlanIdea = {
  date: string;
  platform: Platform;
  format: Format;
  title: string;
  reason: string;
  sourcePostIds: string[];
};

const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * Plan {month} ideas. Each must be a real date in the month (not before `today`), a valid
 * platform + format pair, have a title and reason and no red flags. Emoji removed, lengths cut.
 * Null (→ retry) if fewer than `min` survive.
 */
export function validatePlan(
  raw: unknown,
  ctx: {
    month: string;
    today: string;
    refs: string[];
    labels?: string[];
    min?: number;
    /** Round 3: at most this many (the count asked for). */
    max?: number;
  },
): PlanIdea[] | null {
  if (!isObj(raw) || !Array.isArray(raw.ideas)) return null;
  const last = `${ctx.month}-${String(daysInMonth(ctx.month)).padStart(2, "0")}`;
  const seen = new Set<string>();
  const ideas: PlanIdea[] = [];
  for (const i of raw.ideas) {
    if (!isObj(i) || !isStr(i.date) || !DATE.test(i.date)) continue;
    if (!i.date.startsWith(`${ctx.month}-`) || i.date > last || i.date < ctx.today) continue;
    const platform = i.platform as Platform;
    if (!PLATFORMS.includes(platform)) continue;
    if (!FORMATS_BY_PLATFORM[platform].includes(i.format as Format)) continue;
    const labels = ctx.labels ?? [];
    const title = isStr(i.title)
      ? clip(stripEmoji(humanizeRefs(i.title, labels)), LIMITS.titleChars)
      : "";
    const reason = isStr(i.reason)
      ? clip(stripEmoji(humanizeRefs(i.reason, labels)), LIMITS.reasonChars)
      : "";
    if (!title || !reason) continue;
    if (healthRedFlags(`${title} ${reason}`).length) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const refs = [
      ...(Array.isArray(i.source_refs) ? i.source_refs.filter(isStr) : []),
      ...(isStr(i.reason) ? refsIn(i.reason) : []),
    ];
    ideas.push({
      date: i.date,
      platform,
      format: i.format as Format,
      title,
      reason,
      sourcePostIds: [
        ...new Set(refs.map((r) => refToId(r, ctx.refs)).filter((x): x is string => !!x)),
      ],
    });
  }
  if (ideas.length < (ctx.min ?? 3)) return null;
  return ideas.sort((a, b) => a.date.localeCompare(b.date)).slice(0, ctx.max ?? LIMITS.planIdeas);
}

/** For matching quotes: lower case, straight quotes and dashes, single spaces. */
const norm = (s: string) =>
  squish(s.toLowerCase().replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-"));

export type ClaimsResult = { status: "clear" | "flagged"; issues: Issue[] };

/**
 * Claim check. Keeps only quotes really in the draft; adds the code red flags; status comes from
 * the issues, not from what the model said. Null (→ retry) if the model flagged something but none
 * of its quotes are in the draft and code found nothing either.
 */
export function validateClaims(
  raw: unknown,
  draft: string,
  { health = true }: { health?: boolean } = {},
): ClaimsResult | null {
  if (!isObj(raw)) return null;
  // Lenient shape: a clear answer often leaves out "issues", or "status". The status is worked out
  // from the issues anyway; only an answer with neither key is rejected.
  const hasStatus = raw.status === "clear" || raw.status === "flagged";
  if (!hasStatus && !Array.isArray(raw.issues)) return null;
  const rawIssues: unknown[] = Array.isArray(raw.issues) ? raw.issues : [];
  const haystack = norm(draft);
  const issues: Issue[] = [];
  const add = (quote: string, why: string) => {
    const q = clip(quote.replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""), 200);
    if (!q || !haystack.includes(norm(q))) return;
    if (issues.some((x) => norm(x.quote).includes(norm(q)) || norm(q).includes(norm(x.quote))))
      return;
    issues.push({ quote: q, why: clip(stripEmoji(why) || "Check this wording.", LIMITS.whyChars) });
  };
  for (const i of rawIssues)
    if (isObj(i) && isStr(i.quote)) add(i.quote, isStr(i.why) ? i.why : "");
  // The code list is about health claims: only for clients whose health check is on (Slice 17e).
  if (health)
    for (const f of healthRedFlags(draft.replace(/^(Title|Hook|Caption|Visual idea): /gm, "")))
      add(f.quote, f.why);
  if (raw.status !== "clear" && rawIssues.length > 0 && issues.length === 0) return null;
  return { status: issues.length ? "flagged" : "clear", issues: issues.slice(0, 8) };
}

/** Hooks: plain text, no emoji or wrapping quotes, ≤ 100 chars, no red flags, no duplicates. */
export function validateHooks(raw: unknown, min = 3): string[] | null {
  if (!isObj(raw) || !Array.isArray(raw.hooks)) return null;
  const out: string[] = [];
  for (const h of raw.hooks) {
    if (!isStr(h)) continue;
    const text = stripEmoji(h)
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .trim();
    if (!text || text.length > LIMITS.hookChars) continue;
    if (healthRedFlags(text).length) continue;
    if (out.some((o) => o.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
  }
  return out.length >= min ? out.slice(0, 3) : null;
}

/** What works for competitors, small enough for the hooks prompt (top 5 openings + best format). */
export function hookContext(data: Pick<PullData, "brands" | "posts">, platform: Platform | null) {
  const name = new Map(data.brands.map((b) => [b.id, b.name]));
  const posts = platform ? data.posts.filter((p) => p.platform === platform) : data.posts;
  const f = bestFormat(posts);
  return {
    platform: platform
      ? PLATFORM_LABEL[platform]
      : "Instagram, TikTok, LinkedIn, Facebook, X and YouTube",
    best_format: f ? FORMAT_LABEL[f] : null,
    top_openings: posts
      .filter(countable)
      .sort((a, b) => engagement(b) - engagement(a))
      .slice(0, LIMITS.hookContextPosts)
      .map((p) => ({
        brand: name.get(p.competitor_id) ?? "Unknown",
        format: p.format,
        first_line: clip(stripEmoji((p.caption ?? "").split("\n")[0]), 90),
        likes: p.likes,
        views: p.views,
      }))
      .filter((p) => p.first_line),
  };
}

// ───────────────────────────────────────────── Suggest caption

export type CaptionInput = {
  clientId: string;
  title: string;
  hook: string;
  platform: Platform | null;
  format: Format | null;
};
/** Title and/or hook (one is needed), platform and format. */
export function parseCaptionInput(body: Record<string, unknown>): CaptionInput | InputError {
  if (!isUuid(body.clientId)) return bad("bad_client");
  const title = optText(body.title, 200);
  const hook = optText(body.hook, LIMITS.fieldChars);
  if (!title && !hook) return bad("nothing_to_use");
  const platform = PLATFORMS.includes(body.platform as Platform)
    ? (body.platform as Platform)
    : null;
  const format =
    platform && FORMATS_BY_PLATFORM[platform].includes(body.format as Format)
      ? (body.format as Format)
      : null;
  return { clientId: body.clientId, title, hook, platform, format };
}

/**
 * Platform style. No platform yet: something in between. LinkedIn (Slice 15c): more professional,
 * 3–8 short lines, 2–3 hashtags, at most 1 emoji. Facebook (Slice 16c): conversational, 1–4 short lines
 * (short paragraphs), 0–2 hashtags, ≤ 500 characters, at most 2 emoji.
 */
export const CAPTION_STYLE: Record<
  Platform | "any",
  { lines: [number, number]; tags: [number, number]; chars: number; emoji: number }
> = {
  instagram: { lines: [3, 6], tags: [3, 5], chars: 900, emoji: 2 },
  tiktok: { lines: [1, 2], tags: [2, 4], chars: 300, emoji: 2 },
  linkedin: { lines: [3, 8], tags: [2, 3], chars: 1300, emoji: 1 },
  facebook: { lines: [1, 4], tags: [0, 2], chars: 500, emoji: 2 },
  // X (17g): one post under 280 characters, plain and punchy, 0–2 hashtags, no emoji.
  x: { lines: [1, 3], tags: [0, 2], chars: 280, emoji: 0 },
  // YouTube (18): a video description: a searchable first line or two, then detail, 1–3 hashtags.
  youtube: { lines: [2, 6], tags: [1, 3], chars: 1000, emoji: 1 },
  any: { lines: [2, 4], tags: [3, 5], chars: 600, emoji: 2 },
};
const HASHTAG = /#[\p{L}\p{N}_]+/gu;

/**
 * Captions: wrapping quotes removed, ≤ the platform's emoji (2; LinkedIn 1), hashtags moved to one line at the end (at most the
 * platform's maximum, no repeats), no more body lines than the platform allows, within its length,
 * no code red flags, no repeats. The first try needs 2 options; the retry accepts 1.
 */
export function validateCaptions(
  raw: unknown,
  platform: Platform | null,
  min = 2,
): string[] | null {
  if (!isObj(raw) || !Array.isArray(raw.captions)) return null;
  const style = CAPTION_STYLE[platform ?? "any"];
  const out: string[] = [];
  for (const c of raw.captions) {
    if (!isStr(c)) continue;
    let emoji = 0;
    const text = c
      .trim()
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .replace(EMOJI_SEQ, (m) => (++emoji <= style.emoji ? m : ""));
    const tags = [...new Set((text.match(HASHTAG) ?? []).map((t) => t.toLowerCase()))].slice(
      0,
      style.tags[1],
    );
    const lines = text
      .replace(HASHTAG, "")
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .filter((l) => l && !/^[.,·•|-]+$/.test(l));
    if (!lines.length || lines.length > style.lines[1]) continue;
    const body = lines.join("\n");
    if (healthRedFlags(body).length) continue;
    const caption = tags.length ? `${body}\n\n${tags.join(" ")}` : body;
    if (caption.length > style.chars) continue;
    if (out.some((o) => o.toLowerCase() === caption.toLowerCase())) continue;
    out.push(caption);
  }
  return out.length >= min ? out.slice(0, 2) : null;
}

/** What works on that platform for the caption prompt: the hooks context + its top hashtags. */
export function captionContext(
  data: Pick<PullData, "brands" | "posts">,
  platform: Platform | null,
) {
  const posts = platform ? data.posts.filter((p) => p.platform === platform) : data.posts;
  const count = new Map<string, number>();
  for (const p of posts)
    for (const t of new Set(p.hashtags ?? [])) count.set(t, (count.get(t) ?? 0) + 1);
  return {
    ...hookContext(data, platform),
    top_hashtags: [...count]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([tag]) => tag),
  };
}

/** FNV-1a: tells the card drawer whether the text changed since the last check. */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
