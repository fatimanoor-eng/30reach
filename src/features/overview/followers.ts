// Follower data we already collect (26 Nov): every pull saves each brand's follower count per platform
// (pull_tasks.followers; Facebook from the page check, YouTube subscribers). Pure rules, tested in
// followers.test.ts: counts, growth since the previous pull, and engagement rate. No extra credits.
import type { Platform } from "../../lib/platforms";
import { formatCompact } from "../../lib/format";
import { countable, engagement, type OverviewPost } from "./metrics";

/** One pull task's follower reading. `error_code: "carried"` = copied from the earlier pull (18b). */
export type FollowerTask = {
  competitor_id: string;
  platform: Platform;
  followers: number | null;
  error_code?: string | null;
};

export type FollowerCell = {
  /** Latest count, or null when unknown. */
  count: number | null;
  /** Change since the previous pull, only when both pulls really read it; else null. */
  delta: number | null;
};

/** brand id → platform → count + growth. */
export type FollowerTable = Map<string, Partial<Record<Platform, FollowerCell>>>;

/**
 * Latest and previous pulls' tasks → the table. Growth needs a real reading in both pulls: not when the
 * latest was carried over (not pulled this time), and not on Facebook (its count is only read when the
 * page is saved in Competitors, so two pulls show the same number).
 */
export function followerTable(
  latest: readonly FollowerTask[],
  previous: readonly FollowerTask[] = [],
): FollowerTable {
  const prev = new Map(previous.map((t) => [`${t.competitor_id}|${t.platform}`, t]));
  const table: FollowerTable = new Map();
  for (const t of latest) {
    const before = prev.get(`${t.competitor_id}|${t.platform}`);
    const fresh = t.error_code !== "carried" && t.platform !== "facebook";
    const delta =
      fresh &&
      t.followers !== null &&
      before &&
      before.followers !== null &&
      before.error_code !== "carried"
        ? t.followers - before.followers
        : null;
    const row = table.get(t.competitor_id) ?? {};
    row[t.platform] = { count: t.followers, delta };
    table.set(t.competitor_id, row);
  }
  return table;
}

/**
 * One brand's followers for a view: one platform, or "all" = the sum over platforms with a known count
 * (growth summed over platforms that have one). Null when nothing is known.
 */
export function brandFollowers(
  table: FollowerTable,
  brandId: string,
  platform: Platform | "all",
): FollowerCell {
  const row = table.get(brandId) ?? {};
  if (platform !== "all") return row[platform] ?? { count: null, delta: null };
  const cells = Object.values(row).filter((c): c is FollowerCell => !!c);
  const counts = cells.map((c) => c.count).filter((n): n is number => n !== null);
  const deltas = cells.map((c) => c.delta).filter((n): n is number => n !== null);
  return {
    count: counts.length ? counts.reduce((a, b) => a + b, 0) : null,
    delta: deltas.length ? deltas.reduce((a, b) => a + b, 0) : null,
  };
}

/**
 * Engagement rate (0–1): each post's engagement ÷ the brand's followers on that post's platform, averaged
 * over the posts where the count is known (so "All" mixes platforms fairly). Null when none is known.
 */
export function engagementRate(
  posts: readonly OverviewPost[],
  table: FollowerTable,
  brandId: string,
): number | null {
  const row = table.get(brandId) ?? {};
  const rates = posts
    .filter((p) => p.competitor_id === brandId && countable(p))
    .map((p) => {
      const f = row[p.platform]?.count;
      return f && f > 0 ? engagement(p) / f : null;
    })
    .filter((r): r is number => r !== null);
  return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
}

/** "2.4%", "0.35%", "<0.01%", or "—". */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  const pct = rate * 100;
  if (pct > 0 && pct < 0.01) return "<0.01%";
  return `${pct >= 1 ? pct.toFixed(1) : pct.toFixed(2)}%`;
}

/** "412K" / "—". */
export const formatFollowers = (count: number | null | undefined) =>
  count === null || count === undefined ? "—" : formatCompact(count);

/** "+3.2K" / "−1.1K" (a real minus sign); null for no growth number or no change. */
export function formatDelta(delta: number | null | undefined): string | null {
  if (delta === null || delta === undefined || delta === 0) return null;
  return `${delta > 0 ? "+" : "−"}${formatCompact(Math.abs(delta))}`;
}
