// Social pages (Slice 7: 06a / 06b / 06c, M05 / M06). Pure functions, tested in social-metrics.test.ts.
// Reuses Overview's rules: engagement = likes + comments (TikTok views shown, never ranked), hidden-count
// posts excluded from averages, a format needs ≥ 3 posts, < 10 posts = small sample.

import { formatCompact, plural } from "../../lib/format";
import type { ShownPlatform as Platform } from "../../lib/platforms";
import {
  type BrandRef,
  engagement,
  FORMAT_LABEL,
  type Kpi,
  leaderboard,
  MIN_FORMAT_POSTS,
  type OverviewPost,
  SMALL_SAMPLE,
} from "../overview/metrics";

const countable = (p: OverviewPost) => !p.counts_hidden;
const avg = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

type Format = NonNullable<OverviewPost["format"]>;
export const FORMAT_ORDER: Format[] = ["reel", "carousel", "image", "video"];

// ───────────────────────────────────────────── formats
export type FormatStat = {
  format: Format;
  label: string;
  /** avg likes + comments per post */
  avg: number;
  /** avg views (TikTok; null when no post has views) */
  avgViews: number | null;
  n: number;
  /** ≥ 3 posts — only these can be "best" */
  eligible: boolean;
  best: boolean;
};

export function formatStats(posts: OverviewPost[]): FormatStat[] {
  const groups = new Map<Format, OverviewPost[]>();
  for (const p of posts.filter(countable)) {
    if (p.format) groups.set(p.format, [...(groups.get(p.format) ?? []), p]);
  }
  const stats = [...groups].map(([format, list]) => {
    const views = list.map((p) => p.views).filter((v): v is number => v !== null);
    return {
      format,
      label: FORMAT_LABEL[format],
      avg: avg(list.map(engagement)),
      avgViews: views.length ? avg(views) : null,
      n: list.length,
      eligible: list.length >= MIN_FORMAT_POSTS,
      best: false,
    };
  });
  stats.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.avg - a.avg);
  if (stats[0]?.eligible) stats[0].best = true;
  return stats;
}

// ───────────────────────────────────────────── hashtags
export type TagCount = { tag: string; count: number };

/** Hashtags by number of posts using them (one per post), most used first. */
export function topHashtags(posts: OverviewPost[], limit = 8): TagCount[] {
  const counts = new Map<string, number>();
  for (const p of posts)
    for (const t of new Set(p.hashtags ?? [])) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

// ───────────────────────────────────────────── best times (US Eastern, day parts)
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type DayPart = { key: string; label: string; short: string; long: string; range: string };
/** Morn 6–11 am · Midday 11 am–2 pm · Aft 2–6 pm · Eve 6–11 pm · Night 11 pm–6 am (US Eastern). */
export const DAY_PARTS: DayPart[] = [
  { key: "morn", label: "Morn", short: "morn", long: "morning", range: "6–11 am" },
  { key: "midday", label: "Midday", short: "noon", long: "midday", range: "11 am–2 pm" },
  { key: "aft", label: "Aft", short: "aft", long: "afternoon", range: "2–6 pm" },
  { key: "eve", label: "Eve", short: "eve", long: "evening", range: "6–11 pm" },
  { key: "night", label: "Night", short: "night", long: "night", range: "11 pm–6 am" },
];

export function dayPartIndex(hour: number): number {
  if (hour >= 6 && hour < 11) return 0;
  if (hour >= 11 && hour < 14) return 1;
  if (hour >= 14 && hour < 18) return 2;
  if (hour >= 18 && hour < 23) return 3;
  return 4;
}

const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});

export type HeatCell = { day: Weekday; part: DayPart; n: number; avg: number };
export type Heatmap = {
  /** rows = Mon…Sun, columns = DAY_PARTS */
  rows: HeatCell[][];
  max: number;
  /** strongest cell with ≥ 2 posts (null if none) */
  strongest: HeatCell | null;
};

/** Calendar day in US Eastern (a 1 am post counts as that day's night). */
export function heatmap(posts: OverviewPost[]): Heatmap {
  const buckets = WEEKDAYS.map(() => DAY_PARTS.map(() => [] as number[]));
  for (const p of posts.filter(countable)) {
    if (!p.posted_at) continue;
    const parts = EASTERN.formatToParts(new Date(p.posted_at));
    const day = WEEKDAYS.indexOf(parts.find((x) => x.type === "weekday")!.value as Weekday);
    const hour = Number(parts.find((x) => x.type === "hour")!.value);
    if (day >= 0) buckets[day][dayPartIndex(hour)].push(engagement(p));
  }
  const rows = buckets.map((cols, d) =>
    cols.map((list, i) => ({
      day: WEEKDAYS[d],
      part: DAY_PARTS[i],
      n: list.length,
      avg: avg(list),
    })),
  );
  const cells = rows.flat();
  const strongest = cells.filter((c) => c.n >= 2).sort((a, b) => b.avg - a.avg)[0] ?? null;
  return { rows, max: Math.max(0, ...cells.map((c) => c.avg)), strongest };
}

const DAY_LONG: Record<Weekday, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};
export const cellLabel = (c: Pick<HeatCell, "day" | "part">) => `${DAY_LONG[c.day]} ${c.part.long}`;

// ───────────────────────────────────────────── KPI strip (06a / 06b)
/**
 * Posts · Avg engagement · Best format · Best time. One brand → "#2 of 6 brands" (rank among all brands
 * on this platform, same date range). TikTok → views in the caption.
 */
export function socialKpis(args: {
  posts: OverviewPost[];
  /** the same platform + date range, ALL brands (for the rank) */
  allBrandPosts: OverviewPost[];
  brands: BrandRef[];
  selected: readonly string[];
  platform: Platform;
  days: number;
}): Kpi[] {
  const { posts, allBrandPosts, brands, selected, platform, days } = args;
  const single = selected.length === 1;
  const counted = posts.filter(countable);
  const avgEng = avg(counted.map(engagement));
  const views = counted.map((p) => p.views).filter((v): v is number => v !== null);

  const postsKpi: Kpi = {
    label: "Posts",
    value: posts.length.toLocaleString("en-US"),
    caption: single
      ? `${days} days${posts.length < SMALL_SAMPLE ? " · small sample" : ""}`
      : `${plural(brands.length, "brand")} · ${days} days`,
  };

  let engCaption = "likes + comments / post";
  if (single) {
    const rows = leaderboard(allBrandPosts, brands).filter((r) => r.posts > 0);
    const rank = rows.find((r) => r.brand.id === selected[0])?.rank;
    engCaption = rank ? `#${rank} of ${plural(rows.length, "brand")}` : "No posts in this range";
  }
  if (platform === "tiktok" && views.length)
    engCaption += ` · ${formatCompact(avg(views))} avg views`;
  const engKpi: Kpi = {
    label: "Avg engagement",
    value: counted.length ? formatCompact(avgEng) : "—",
    caption: engCaption,
  };

  const best = formatStats(posts).find((f) => f.best);
  const formatKpi: Kpi = best
    ? { label: "Best format", value: best.label, caption: `${formatCompact(best.avg)} avg` }
    : { label: "Best format", value: "—", caption: "Not enough posts yet" };

  const strongest = heatmap(posts).strongest;
  const timeKpi: Kpi = strongest
    ? {
        label: "Best time",
        value: `${strongest.day} ${strongest.part.long}`,
        caption: `${strongest.part.range} · US Eastern`,
      }
    : { label: "Best time", value: "Not enough posts", caption: "needs 2+ posts in a slot" };

  return [postsKpi, engKpi, formatKpi, timeKpi];
}

// ───────────────────────────────────────────── compare (06c / M06)
export type HeadToHeadColumn = {
  brand: BrandRef;
  posts: number;
  avgEngagement: number;
  bestFormat: string;
  /** "Tue 6–11 pm" (desktop) */
  bestTime: string;
  /** "Tue eve" (mobile) */
  bestTimeShort: string;
  topTag: string | null;
  smallSample: boolean;
  aheadPosts: boolean;
  aheadEngagement: boolean;
};

/** One column per selected brand, in selection order (= compare colours ink / Pop / Blue). */
export function headToHead(posts: OverviewPost[], brands: BrandRef[]): HeadToHeadColumn[] {
  const cols = brands.map((brand) => {
    const own = posts.filter((p) => p.competitor_id === brand.id);
    const counted = own.filter(countable);
    const strongest = heatmap(own).strongest;
    return {
      brand,
      posts: own.length,
      avgEngagement: avg(counted.map(engagement)),
      bestFormat: formatStats(own).find((f) => f.best)?.label ?? "—",
      bestTime: strongest ? `${strongest.day} ${strongest.part.range}` : "—",
      bestTimeShort: strongest ? `${strongest.day} ${strongest.part.short}` : "—",
      topTag: topHashtags(own, 1)[0]?.tag ?? null,
      smallSample: own.length > 0 && own.length < SMALL_SAMPLE,
      aheadPosts: false,
      aheadEngagement: false,
    };
  });
  const leader = (key: "posts" | "avgEngagement") => {
    const top = Math.max(...cols.map((c) => c[key]));
    const winners = cols.filter((c) => c[key] === top);
    return top > 0 && winners.length === 1 ? winners[0] : null;
  };
  const p = leader("posts");
  if (p) p.aheadPosts = true;
  const e = leader("avgEngagement");
  if (e) e.aheadEngagement = true;
  return cols;
}

export type FormatCompareRow = {
  format: Format;
  label: string;
  values: { brandId: string; avg: number; n: number; eligible: boolean }[];
};

/** Formats side by side: every format any selected brand used, avg engagement per brand. */
export function formatsByBrand(posts: OverviewPost[], brands: BrandRef[]): FormatCompareRow[] {
  const perBrand = new Map(
    brands.map((b) => [b.id, formatStats(posts.filter((p) => p.competitor_id === b.id))]),
  );
  const used = FORMAT_ORDER.filter((f) =>
    [...perBrand.values()].some((stats) => stats.some((s) => s.format === f)),
  );
  return used.map((format) => ({
    format,
    label: FORMAT_LABEL[format],
    values: brands.map((b) => {
      const s = perBrand.get(b.id)!.find((x) => x.format === format);
      return { brandId: b.id, avg: s?.avg ?? 0, n: s?.n ?? 0, eligible: s?.eligible ?? false };
    }),
  }));
}

export type OverlapColumn = { key: string; label: string; brandIds: string[]; tags: TagCount[] };

/**
 * Hashtag overlap. 2 brands → Only A · Both · Only B. 3 brands → Only A · Only B · Only C · Shared
 * (used by 2+ of them). Tags by total posts using them; up to `limit` per column.
 */
export function hashtagOverlap(
  posts: OverviewPost[],
  brands: BrandRef[],
  limit = 5,
): OverlapColumn[] {
  const usage = new Map<string, Map<string, number>>(); // tag → brandId → posts
  for (const p of posts) {
    if (!brands.some((b) => b.id === p.competitor_id)) continue;
    for (const t of new Set(p.hashtags ?? [])) {
      const m = usage.get(t) ?? new Map<string, number>();
      m.set(p.competitor_id, (m.get(p.competitor_id) ?? 0) + 1);
      usage.set(t, m);
    }
  }
  const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const pick = (test: (m: Map<string, number>) => boolean) =>
    [...usage]
      .filter(([, m]) => test(m))
      .map(([tag, m]) => ({ tag, count: total(m) }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, limit);
  const only = (b: BrandRef): OverlapColumn => ({
    key: `only-${b.id}`,
    label: `Only ${b.name}`,
    brandIds: [b.id],
    tags: pick((m) => m.size === 1 && m.has(b.id)),
  });
  const shared: OverlapColumn = {
    key: "shared",
    label: brands.length === 2 ? "Both" : "Shared",
    brandIds: brands.map((b) => b.id),
    tags: pick((m) => m.size >= 2),
  };
  return brands.length === 2
    ? [only(brands[0]), shared, only(brands[1])]
    : [...brands.map(only), shared];
}
