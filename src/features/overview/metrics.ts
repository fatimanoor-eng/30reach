// Overview numbers (Slice 6), computed in the browser from the saved pull (~170 posts).
// Pure functions — tested in metrics.test.ts. Engagement = likes + comments (TikTok views shown, not ranked).
// LinkedIn (Slice 15b): `likes` holds all reactions, `shares` the reposts (shown, not ranked), no views.
// Facebook (Slice 16b): `likes` = all reactions, `shares` = shares, views on videos / reels only (shown,
// never ranked).

import { brandFollowers, engagementRate, type FollowerCell, type FollowerTable } from "./followers";
import { formatClock, formatCompact, formatShortDate, plural } from "../../lib/format";
import { type Platform, PLATFORM_NAME } from "../../lib/platforms";

export type OverviewPost = {
  id: string;
  competitor_id: string;
  platform: Platform;
  external_id: string;
  url: string;
  posted_at: string | null;
  format:
    | "reel"
    | "carousel"
    | "image"
    | "video"
    | "text"
    | "document"
    | "article"
    | "poll"
    | "short"
    | null;
  caption: string | null;
  hashtags: string[] | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  /** LinkedIn reposts / Facebook (and TikTok) shares; null on Instagram. */
  shares: number | null;
  counts_hidden: boolean;
  thumbnail_path: string | null;
  /** YouTube (18): the video's length; null / missing elsewhere. */
  duration_seconds?: number | null;
};

export type BrandRef = {
  id: string;
  /** What's shown: the short name when there is one (27 Nov). */
  name: string;
  /** The full name, for tooltips. */
  fullName?: string;
  initials: string;
  logo_path?: string | null;
};
export type PlatformFilter = "all" | Platform;
export type Filters = { platform: PlatformFilter; days: 7 | 30; brandIds: readonly string[] };

const DAY_MS = 24 * 60 * 60 * 1000;
export const STALE_AFTER_DAYS = 7;

export const engagement = (p: OverviewPost) => (p.likes ?? 0) + (p.comments ?? 0);
/** Posts whose like counts are hidden on Instagram can't be averaged honestly. */
export const countable = (p: OverviewPost) => !p.counts_hidden;

/** Platform + brands + date range. The range counts back from the PULL time, not today. */
export type Carried = Partial<Record<Platform, string>> | null | undefined;

/**
 * 18b: a platform carried from an older pull counts its window back from that pull's date (its own
 * snapshot), not the new pull's.
 */
export function filterPosts(
  posts: OverviewPost[],
  f: Filters,
  pullStartedAt: string,
  carried?: Carried,
): OverviewPost[] {
  return posts.filter((p) => {
    if (f.platform !== "all" && p.platform !== f.platform) return false;
    if (f.brandIds.length && !f.brandIds.includes(p.competitor_id)) return false;
    const end = Date.parse(carried?.[p.platform] ?? pullStartedAt);
    const t = p.posted_at ? Date.parse(p.posted_at) : NaN;
    return t >= end - f.days * DAY_MS && t <= end;
  });
}

// ───────────────────────────────────────────── leaderboard
export type LeaderRow = {
  brand: BrandRef;
  rank: number;
  posts: number;
  avgLikes: number;
  avgComments: number;
  avgEngagement: number;
  /** Share of all engagement in the filter, 0–1. */
  share: number;
  /** Fewer than SMALL_SAMPLE posts in the range — averages can swing a lot. */
  smallSample: boolean;
  /** Followers in this view (one platform, or the sum on All) + growth since the previous pull (26 Nov). */
  followers: FollowerCell;
  /** Avg engagement ÷ followers (0–1), post by post on that post's platform; null when unknown. */
  engagementRate: number | null;
};

export type LeaderSort = "engagement" | "rate";

export const SMALL_SAMPLE = 10;

/**
 * Sorted by avg engagement = (likes + comments) / posts (or by engagement rate, 26 Nov: unknown rates
 * last). Brands without posts come last. `followers` (from the pulls) adds counts, growth and the rate.
 */
export function leaderboard(
  posts: OverviewPost[],
  brands: BrandRef[],
  {
    followers = new Map(),
    platform = "all",
    sortBy = "engagement",
  }: { followers?: FollowerTable; platform?: Platform | "all"; sortBy?: LeaderSort } = {},
): LeaderRow[] {
  const total = posts.filter(countable).reduce((sum, p) => sum + engagement(p), 0);
  return brands
    .map((brand) => {
      const own = posts.filter((p) => p.competitor_id === brand.id);
      const counted = own.filter(countable);
      const sum = (key: "likes" | "comments") => counted.reduce((s, p) => s + (p[key] ?? 0), 0);
      const eng = counted.reduce((s, p) => s + engagement(p), 0);
      const n = counted.length;
      return {
        brand,
        rank: 0,
        posts: own.length,
        avgLikes: n ? sum("likes") / n : 0,
        avgComments: n ? sum("comments") / n : 0,
        avgEngagement: n ? eng / n : 0,
        share: total ? eng / total : 0,
        smallSample: own.length > 0 && own.length < SMALL_SAMPLE,
        followers: brandFollowers(followers, brand.id, platform),
        engagementRate: engagementRate(own, followers, brand.id),
      };
    })
    .sort(
      (a, b) =>
        (sortBy === "rate" ? (b.engagementRate ?? -1) - (a.engagementRate ?? -1) : 0) ||
        b.avgEngagement - a.avgEngagement ||
        b.posts - a.posts ||
        a.brand.name.localeCompare(b.brand.name),
    )
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

// ───────────────────────────────────────────── KPIs
export const FORMAT_LABEL: Record<NonNullable<OverviewPost["format"]>, string> = {
  reel: "Reels",
  carousel: "Carousels",
  image: "Single images",
  video: "Videos",
  text: "Text posts",
  document: "Documents",
  article: "Links",
  poll: "Polls",
  short: "Shorts",
};

/**
 * A format's name for a group of posts. LinkedIn counts multi-image posts as "image", so a group of
 * only LinkedIn posts says "Images" (not "Single images"); Facebook's multi-image posts are albums, so a
 * group of only Facebook carousels says "Albums".
 */
export function formatName(format: NonNullable<OverviewPost["format"]>, posts: OverviewPost[]) {
  const only = (platform: Platform) =>
    posts.length > 0 && posts.every((p) => p.platform === platform);
  if (format === "image" && only("linkedin")) return "Images";
  if (format === "carousel" && only("facebook")) return "Albums";
  return FORMAT_LABEL[format];
}

export type Kpi = {
  label: string;
  shortLabel?: string;
  value: string;
  caption: string;
  /** Small text after the value on mobile, where captions are hidden (e.g. "am" for Best time). */
  mobileSuffix?: string;
};

const PLATFORM_TEXT: Record<PlatformFilter, string> = { all: "all platforms", ...PLATFORM_NAME };

const perDay = (n: number, days: number) => {
  const rate = Math.round((n / days) * 10) / 10;
  return `${rate % 1 === 0 ? rate.toFixed(0) : rate.toFixed(1)} a day`;
};

/** A format needs this many posts before its average is compared (23.8× came from 2 images). */
export const MIN_FORMAT_POSTS = 3;

/**
 * Best format by avg engagement, among formats with ≥ 3 posts.
 * 2+ such formats → "N× the engagement of <weakest>". Only 1 → compared with the average of all other
 * posts (if there are ≥ 3), else no ratio.
 */
export function bestFormat(posts: OverviewPost[]): Kpi {
  const label = "Best format";
  const groups = new Map<string, number[]>();
  const counted = posts.filter(countable);
  for (const p of counted) {
    if (!p.format) continue;
    groups.set(p.format, [...(groups.get(p.format) ?? []), engagement(p)]);
  }
  type Format = NonNullable<OverviewPost["format"]>;
  const nameOf = (f: string) =>
    formatName(
      f as Format,
      counted.filter((p) => p.format === f),
    );
  const avg = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
  const eligible = [...groups]
    .filter(([, list]) => list.length >= MIN_FORMAT_POSTS)
    .map(([format, list]) => ({ format, avg: avg(list), n: list.length }))
    .sort((a, b) => b.avg - a.avg);
  if (eligible.length === 0) return { label, value: "—", caption: "Not enough posts yet" };

  const best = eligible[0];
  const name = nameOf(best.format);
  const ratio = (a: number, b: number) => Math.round((a / b) * 10) / 10;

  if (eligible.length >= 2) {
    const worst = eligible.at(-1)!;
    if (worst.avg > 0) {
      return {
        label,
        value: name,
        caption: `${ratio(best.avg, worst.avg)}× the engagement of ${nameOf(worst.format).toLowerCase()}`,
      };
    }
  }
  const others = [...groups].filter(([f]) => f !== best.format).flatMap(([, list]) => list);
  if (others.length >= MIN_FORMAT_POSTS && avg(others) > 0) {
    return {
      label,
      value: name,
      caption: `${ratio(best.avg, avg(others))}× the engagement of other formats`,
    };
  }
  return { label, value: name, caption: `Based on ${plural(best.n, "post")}` };
}

const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});

function hourLabel(h: number) {
  const suffix = h < 12 || h === 24 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return { twelve, suffix };
}

/** "Tue 6–8 pm", "Sat 10 am–12 pm" for a 2-hour slot starting at `start` (0, 2, … 22). */
export function slotLabel(weekday: string, start: number): string {
  const a = hourLabel(start);
  const b = hourLabel(start + 2);
  return a.suffix === b.suffix
    ? `${weekday} ${a.twelve}–${b.twelve} ${b.suffix}`
    : `${weekday} ${a.twelve} ${a.suffix}–${b.twelve} ${b.suffix}`;
}

/**
 * Short form for the KPI tile so all tiles stay one line: value "Mon 10–12", meridiem "am" (of the
 * slot's start) goes in the caption / mobile suffix.
 */
export function slotShort(weekday: string, start: number): { value: string; meridiem: string } {
  const a = hourLabel(start);
  const b = hourLabel(start + 2);
  return { value: `${weekday} ${a.twelve}–${b.twelve}`, meridiem: a.suffix };
}

/** Best 2-hour slot in US Eastern by avg engagement; a slot needs ≥ 2 posts (no single viral post). */
export function bestTime(posts: OverviewPost[]): Kpi {
  const slots = new Map<string, number[]>();
  for (const p of posts.filter(countable)) {
    if (!p.posted_at) continue;
    const parts = EASTERN.formatToParts(new Date(p.posted_at));
    const weekday = parts.find((x) => x.type === "weekday")!.value;
    const hour = Number(parts.find((x) => x.type === "hour")!.value);
    const key = `${weekday}|${hour - (hour % 2)}`;
    slots.set(key, [...(slots.get(key) ?? []), engagement(p)]);
  }
  const best = [...slots]
    .filter(([, list]) => list.length >= 2)
    .map(([key, list]) => ({ key, avg: list.reduce((a, b) => a + b, 0) / list.length }))
    .sort((a, b) => b.avg - a.avg)[0];
  if (!best)
    return {
      label: "Best time to post",
      shortLabel: "Best time",
      value: "—",
      caption: "Not enough posts yet",
    };
  const [weekday, start] = best.key.split("|");
  const short = slotShort(weekday, Number(start));
  return {
    label: "Best time to post",
    shortLabel: "Best time",
    value: short.value,
    caption: `${short.meridiem} · US Eastern`,
    mobileSuffix: short.meridiem,
  };
}

/**
 * The four KPI tiles. All brands / 2–3 brands → combined numbers + "Most active".
 * One brand → "Posting rate" instead of "Most active".
 */
export function kpis(posts: OverviewPost[], brands: BrandRef[], f: Filters): Kpi[] {
  const inScope = f.brandIds.length ? brands.filter((b) => f.brandIds.includes(b.id)) : brands;
  const brandText =
    f.brandIds.length === 1 ? (inScope[0]?.name ?? "1 brand") : plural(inScope.length, "brand");
  const tracked: Kpi = {
    label: "Posts tracked",
    shortLabel: "Posts",
    value: posts.length.toLocaleString("en-US"),
    caption: `${f.brandIds.length === 1 ? "" : "Across "}${brandText}, ${PLATFORM_TEXT[f.platform]}`,
  };

  let activity: Kpi;
  if (f.brandIds.length === 1) {
    activity = {
      label: "Posting rate",
      value: perDay(posts.length, f.days),
      caption: `${plural(posts.length, "post")} in ${f.days} days`,
    };
  } else {
    const counts = inScope
      .map((b) => ({ b, n: posts.filter((p) => p.competitor_id === b.id).length }))
      .sort((a, b) => b.n - a.n);
    const top = counts[0];
    activity =
      top && top.n > 0
        ? {
            label: "Most active",
            value: top.b.name,
            caption: `${plural(top.n, "post")}, about ${perDay(top.n, f.days)}`,
          }
        : { label: "Most active", value: "—", caption: "No posts in this range" };
  }
  return [tracked, bestFormat(posts), activity, bestTime(posts)];
}

/** Top posts by likes + comments (hidden-count posts excluded), newest first on ties. */
export function topPosts(posts: OverviewPost[], n = 3): OverviewPost[] {
  return posts
    .filter(countable)
    .sort(
      (a, b) =>
        engagement(b) - engagement(a) || (b.posted_at ?? "").localeCompare(a.posted_at ?? ""),
    )
    .slice(0, n);
}

/**
 * "18.4K likes · 1.1K comments" (Instagram) / "212K views · 9.8K likes" (TikTok) /
 * "1.2K reactions · 48 comments · 12 reposts" (LinkedIn) /
 * "2.8K views · 12 reactions · 3 comments · 3 shares" (Facebook; views on videos / reels only) /
 * "4.1K views · 120 likes · 8 replies · 12 reposts" (X; reposts = reposts + quotes) /
 * "12K views · 340 likes · 21 comments · 8:42" (YouTube, with the video's length).
 */
/** 40 → "0:40", 2824 → "47:04", 3723 → "1:02:03" (YouTube's own style). */
export function clockDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function postStats(p: OverviewPost): string {
  // LinkedIn's and Facebook's 3–4 parts wrap on cards: keep each number with its word ("12\u00a0reposts").
  const gap =
    p.platform === "linkedin" ||
    p.platform === "facebook" ||
    p.platform === "x" ||
    p.platform === "youtube"
      ? "\u00a0"
      : " ";
  const part = (n: number | null, word: string) =>
    n === null
      ? null
      : `${formatCompact(n)}${gap}${n === 1 ? word : word === "reply" ? "replies" : `${word}s`}`;
  const parts =
    p.platform === "tiktok"
      ? [part(p.views, "view"), part(p.likes, "like")]
      : p.platform === "linkedin"
        ? [part(p.likes, "reaction"), part(p.comments, "comment"), part(p.shares, "repost")]
        : p.platform === "facebook"
          ? [
              part(p.views, "view"),
              part(p.likes, "reaction"),
              part(p.comments, "comment"),
              part(p.shares, "share"),
            ]
          : p.platform === "x"
            ? [
                part(p.views, "view"),
                part(p.likes, "like"),
                part(p.comments, "reply"),
                part(p.shares, "repost"),
              ]
            : p.platform === "youtube"
              ? [
                  part(p.views, "view"),
                  p.counts_hidden ? "likes hidden" : part(p.likes, "like"),
                  part(p.comments, "comment"),
                  p.duration_seconds ? clockDuration(p.duration_seconds) : null,
                ]
              : [
                  p.counts_hidden ? "likes hidden" : part(p.likes, "like"),
                  part(p.comments, "comment"),
                ];
  return parts.filter(Boolean).join(" · ");
}

// ───────────────────────────────────────────── stale data
export function daysSince(iso: string, now = Date.now()): number {
  return Math.floor((now - Date.parse(iso)) / DAY_MS);
}
export const isStale = (iso: string, now = Date.now()) => daysSince(iso, now) > STALE_AFTER_DAYS;

/**
 * The "Last pulled" line (Slice 18b: some platforms may be carried from an older pull).
 * - A platform page whose platform was carried: "From the 16 Nov pull" (amber + "· 9 days ago" when stale).
 * - Otherwise "Last pulled 25 Nov, 10:20", and on Overview the carried ones: "· TikTok, LinkedIn from 16 Nov".
 * Amber when the oldest data shown is more than 7 days old.
 */
export function lastPulledLine(o: {
  startedAt: string;
  carried?: Partial<Record<Platform, string>> | null;
  /** a platform page; omitted = Overview (all platforms) */
  platform?: Platform;
  names: Record<Platform, string>;
  now?: number;
}): { text: string; stale: boolean } {
  const now = o.now ?? Date.now();
  const carried = o.carried ?? {};
  const ago = (iso: string) => `${plural(daysSince(iso, now), "day")} ago`;
  if (o.platform && carried[o.platform]) {
    const from = carried[o.platform]!;
    const stale = isStale(from, now);
    return {
      text: `From the ${formatShortDate(from)} pull${stale ? ` · ${ago(from)}` : ""}`,
      stale,
    };
  }
  const own = isStale(o.startedAt, now)
    ? `Last pulled ${formatShortDate(o.startedAt)} · ${ago(o.startedAt)}`
    : `Last pulled ${formatShortDate(o.startedAt)}, ${formatClock(o.startedAt)}`;
  const older = o.platform ? [] : (Object.entries(carried) as [Platform, string][]);
  // "TikTok, LinkedIn from 16 Nov · YouTube from 2 Nov": grouped by date, oldest last.
  const byDate = new Map<string, Platform[]>();
  for (const [p, d] of [...older].sort((a, b) => b[1].localeCompare(a[1])))
    byDate.set(d, [...(byDate.get(d) ?? []), p]);
  const parts = [...byDate].map(
    ([d, ps]) => `${ps.map((p) => o.names[p]).join(", ")} from ${formatShortDate(d)}`,
  );
  const oldest = [o.startedAt, ...older.map(([, d]) => d)].sort()[0];
  return { text: [own, ...parts].join(" · "), stale: isStale(oldest, now) };
}

// ───────────────────────────────────────────── 05e What's new
export type WhatsNew = {
  newPostIds: Set<string>;
  newCount: number;
  /** brandId → places moved (+ up, − down) */
  rankDelta: Map<string, number>;
  /** "21 new posts · Hims moved up to #1 · new tag #dryjanuary" */
  summary: string[];
  /** 18b: platforms not pulled this time (carried over): left out of the comparison. */
  notPulled: Platform[];
};

/**
 * Latest vs previous pull, with the same filters (each pull's window counts back from its own time).
 * New post = (platform, external_id) not in the previous pull at all.
 */
export function whatsNew(
  latest: OverviewPost[],
  previous: OverviewPost[],
  f: Filters,
  latestStartedAt: string,
  previousStartedAt: string,
  brands: BrandRef[],
  carried: { latest?: Carried; previous?: Carried } = {},
): WhatsNew {
  // 18b: platforms carried into the latest pull weren't pulled: compare them with themselves (the same
  // copy), so they add no new posts, no new tags and move no ranks. Only pulled platforms change.
  const notPulled = Object.keys(carried.latest ?? {}) as Platform[];
  const comparable = [
    ...previous.filter((p) => !notPulled.includes(p.platform)),
    ...latest.filter((p) => notPulled.includes(p.platform)),
  ];
  const thenCarried = { ...(carried.previous ?? {}), ...(carried.latest ?? {}) };
  const before = new Set(comparable.map((p) => `${p.platform}:${p.external_id}`));
  const now = filterPosts(latest, f, latestStartedAt, carried.latest);
  const then = filterPosts(comparable, f, previousStartedAt, thenCarried);
  const fresh = now.filter((p) => !before.has(`${p.platform}:${p.external_id}`));

  const inScope = f.brandIds.length ? brands.filter((b) => f.brandIds.includes(b.id)) : brands;
  const rankNow = new Map(leaderboard(now, inScope).map((r) => [r.brand.id, r.rank]));
  const rankThen = new Map(leaderboard(then, inScope).map((r) => [r.brand.id, r.rank]));
  const rankDelta = new Map<string, number>();
  for (const [id, r] of rankNow) {
    const delta = (rankThen.get(id) ?? r) - r;
    if (delta !== 0) rankDelta.set(id, delta);
  }

  const summary: string[] = [plural(fresh.length, "new post")];
  const newLeader = [...rankDelta].find(([id, d]) => d > 0 && rankNow.get(id) === 1);
  const biggestRise = [...rankDelta].filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1])[0];
  const mover = newLeader ?? biggestRise;
  if (mover) {
    const name = brands.find((b) => b.id === mover[0])?.name ?? "A brand";
    summary.push(`${name} moved up to #${rankNow.get(mover[0])}`);
  }

  const oldTags = new Set(comparable.flatMap((p) => p.hashtags ?? []));
  const counts = new Map<string, number>();
  for (const p of now)
    for (const t of p.hashtags ?? []) if (!oldTags.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tag = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (tag) summary.push(`new tag #${tag[0]}`);

  return {
    newPostIds: new Set(fresh.map((p) => p.id)),
    newCount: fresh.length,
    rankDelta,
    summary,
    notPulled,
  };
}

/** "TikTok and LinkedIn weren’t pulled this time, so they aren’t compared." */
export function notPulledNote(platforms: Platform[]): string {
  const names = platforms.map((p) => PLATFORM_NAME[p]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return `${list} ${names.length > 1 ? "weren’t" : "wasn’t"} pulled this time, so ${
    names.length > 1 ? "they aren’t" : "it isn’t"
  } compared.`;
}
