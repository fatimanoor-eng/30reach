// Overview numbers (Slice 6), computed in the browser from the saved pull (~170 posts).
// Pure functions — tested in metrics.test.ts. Engagement = likes + comments (TikTok views shown, not ranked).

import { formatCompact, plural } from "../../lib/format";
import type { Platform } from "../../lib/pulls/api";

export type OverviewPost = {
  id: string;
  competitor_id: string;
  platform: Platform;
  external_id: string;
  url: string;
  posted_at: string | null;
  format: "reel" | "carousel" | "image" | "video" | null;
  caption: string | null;
  hashtags: string[] | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  counts_hidden: boolean;
  thumbnail_path: string | null;
};

export type BrandRef = { id: string; name: string; initials: string };
export type PlatformFilter = "both" | Platform;
export type Filters = { platform: PlatformFilter; days: 7 | 30; brandIds: readonly string[] };

const DAY_MS = 24 * 60 * 60 * 1000;
export const STALE_AFTER_DAYS = 7;

export const engagement = (p: OverviewPost) => (p.likes ?? 0) + (p.comments ?? 0);
/** Posts whose like counts are hidden on Instagram can't be averaged honestly. */
const countable = (p: OverviewPost) => !p.counts_hidden;

/** Platform + brands + date range. The range counts back from the PULL time, not today. */
export function filterPosts(
  posts: OverviewPost[],
  f: Filters,
  pullStartedAt: string,
): OverviewPost[] {
  const end = Date.parse(pullStartedAt);
  const start = end - f.days * DAY_MS;
  return posts.filter((p) => {
    if (f.platform !== "both" && p.platform !== f.platform) return false;
    if (f.brandIds.length && !f.brandIds.includes(p.competitor_id)) return false;
    const t = p.posted_at ? Date.parse(p.posted_at) : NaN;
    return t >= start && t <= end;
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
};

/** Sorted by avg engagement = (likes + comments) / posts. Brands without posts come last. */
export function leaderboard(posts: OverviewPost[], brands: BrandRef[]): LeaderRow[] {
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
      };
    })
    .sort(
      (a, b) =>
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
};

export type Kpi = { label: string; shortLabel?: string; value: string; caption: string };

const PLATFORM_TEXT: Record<PlatformFilter, string> = {
  both: "both platforms",
  instagram: "Instagram",
  tiktok: "TikTok",
};

const perDay = (n: number, days: number) => {
  const rate = Math.round((n / days) * 10) / 10;
  return `${rate % 1 === 0 ? rate.toFixed(0) : rate.toFixed(1)} a day`;
};

/** Best format by avg engagement (≥ 2 posts per format), vs the weakest one. */
export function bestFormat(posts: OverviewPost[]): Kpi {
  const groups = new Map<string, number[]>();
  for (const p of posts.filter(countable)) {
    if (!p.format) continue;
    groups.set(p.format, [...(groups.get(p.format) ?? []), engagement(p)]);
  }
  const avgs = [...groups]
    .filter(([, list]) => list.length >= 2)
    .map(([format, list]) => ({ format, avg: list.reduce((a, b) => a + b, 0) / list.length }))
    .sort((a, b) => b.avg - a.avg);
  if (avgs.length === 0)
    return { label: "Best format", value: "—", caption: "Not enough posts yet" };
  const best = avgs[0];
  const worst = avgs.at(-1)!;
  const label = FORMAT_LABEL[best.format as keyof typeof FORMAT_LABEL];
  if (avgs.length === 1 || worst.avg === 0) {
    return { label: "Best format", value: label, caption: "The only format with enough posts" };
  }
  const ratio = Math.round((best.avg / worst.avg) * 10) / 10;
  return {
    label: "Best format",
    value: label,
    caption: `${ratio}× the engagement of ${FORMAT_LABEL[worst.format as keyof typeof FORMAT_LABEL].toLowerCase()}`,
  };
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
  return {
    label: "Best time to post",
    shortLabel: "Best time",
    value: slotLabel(weekday, Number(start)),
    caption: "US Eastern, by avg engagement",
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

/** "18.4K likes · 1.1K comments" (Instagram) / "212K views · 9.8K likes" (TikTok). */
export function postStats(p: OverviewPost): string {
  const part = (n: number | null, word: string) =>
    n === null ? null : `${formatCompact(n)} ${n === 1 ? word : `${word}s`}`;
  const parts =
    p.platform === "tiktok"
      ? [part(p.views, "view"), part(p.likes, "like")]
      : [p.counts_hidden ? "likes hidden" : part(p.likes, "like"), part(p.comments, "comment")];
  return parts.filter(Boolean).join(" · ");
}

// ───────────────────────────────────────────── stale data
export function daysSince(iso: string, now = Date.now()): number {
  return Math.floor((now - Date.parse(iso)) / DAY_MS);
}
export const isStale = (iso: string, now = Date.now()) => daysSince(iso, now) > STALE_AFTER_DAYS;

// ───────────────────────────────────────────── 05e What's new
export type WhatsNew = {
  newPostIds: Set<string>;
  newCount: number;
  /** brandId → places moved (+ up, − down) */
  rankDelta: Map<string, number>;
  /** "21 new posts · Hims moved up to #1 · new tag #dryjanuary" */
  summary: string[];
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
): WhatsNew {
  const before = new Set(previous.map((p) => `${p.platform}:${p.external_id}`));
  const now = filterPosts(latest, f, latestStartedAt);
  const then = filterPosts(previous, f, previousStartedAt);
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

  const oldTags = new Set(previous.flatMap((p) => p.hashtags ?? []));
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
  };
}
