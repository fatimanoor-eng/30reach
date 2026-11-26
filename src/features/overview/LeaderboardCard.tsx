import { useState } from "react";
import { Card } from "../../components/Card";
import { compareColor, type CompareColor } from "../../lib/brand-selection";
import { useBrandSelection } from "../../lib/brand-selection-context";
import { formatCompact, plural } from "../../lib/format";
import { InfoTip } from "../../components/InfoTip";
import { SegmentedControl } from "../../components/SegmentedControl";
import { formatDelta, formatFollowers, formatRate } from "./followers";
import { SMALL_SAMPLE } from "./metrics";
import type { LeaderRow, LeaderSort } from "./metrics";

export const RATE_HELP =
  "Engagement rate = average engagement per post ÷ the brand's followers on that platform. It's fairer between big and small accounts. Followers come from your pulls (no extra credits); “—” means the count wasn't available.";

const FILL: Record<CompareColor, string> = { ink: "bg-ink", pop: "bg-pop", blue: "bg-blue" };
const MOBILE_ROWS = 4;

/**
 * Leaderboard (04 / M02): sorted by avg engagement = (likes + comments) / posts, or (26 Nov) by engagement
 * rate. Followers + growth since the previous pull from the pulls (no credits). Click a brand = select its
 * pill. Bars: #1 ink, others grey; in compare mode the brands' compare colours. ▲/▼ = rank change since the
 * previous pull (05e). Avg likes / comments: in the avg engagement cell's tooltip (no room for both).
 */
export function LeaderboardCard({
  rowsFor,
  rankDelta,
  title = "Leaderboard",
}: {
  /** The rows in the chosen order. */
  rowsFor: (sortBy: LeaderSort) => LeaderRow[];
  rankDelta?: Map<string, number>;
  title?: string;
}) {
  const { selected, toggle } = useBrandSelection();
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState<LeaderSort>("engagement");
  const rows = rowsFor(sortBy);
  const compare = selected.length >= 2;
  const max = Math.max(...rows.map((r) => r.share), 0.0001);

  const barColor = (row: LeaderRow) => {
    const c = compare ? compareColor(selected, row.brand.id) : null;
    if (c) return FILL[c];
    return row.rank === 1 ? "bg-ink" : "bg-sidebar-text";
  };

  // Plain render helpers (not components) so React doesn't remount them on every render.
  const delta = (id: string) => {
    const d = rankDelta?.get(id);
    if (!d) return null;
    return (
      <span
        className={`ml-2 font-mono text-label whitespace-nowrap ${d > 0 ? "text-fresh" : "text-spark"}`}
      >
        <span aria-hidden="true">{d > 0 ? "▲" : "▼"}</span> {Math.abs(d)}
        <span className="sr-only"> {d > 0 ? "up" : "down"} since the last pull</span>
      </span>
    );
  };

  const sampleHint = (row: LeaderRow) =>
    row.smallSample ? (
      <span
        title={`Fewer than ${SMALL_SAMPLE} posts in this range — averages can swing a lot`}
        className="ml-2 rounded-sm bg-soft px-1 font-mono text-label whitespace-nowrap text-muted"
      >
        small sample
      </span>
    ) : null;

  const growth = (row: LeaderRow) => {
    const d = formatDelta(row.followers.delta);
    if (!d) return null;
    const up = (row.followers.delta ?? 0) > 0;
    return (
      <span className={`block font-mono text-label ${up ? "text-fresh" : "text-spark-text"}`}>
        {d} <span aria-hidden="true">{up ? "↑" : "↓"}</span>
        <span className="sr-only"> since the last pull</span>
      </span>
    );
  };

  const bar = (row: LeaderRow, className = "") => (
    <div className={`h-1.5 overflow-hidden rounded-full bg-soft ${className}`} aria-hidden="true">
      <div
        className={`h-full rounded-full ${barColor(row)}`}
        style={{ width: `${(row.share / max) * 100}%` }}
      />
    </div>
  );

  return (
    <Card
      title={title}
      action={
        <span className="flex items-center gap-2">
          <SegmentedControl
            label="Sort the leaderboard by"
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: "engagement", label: "Engagement" },
              { value: "rate", label: "Engagement rate" },
            ]}
          />
          <InfoTip text={RATE_HELP} label="What is engagement rate?" />
        </span>
      }
    >
      {/* Tablet / desktop: full table */}
      <table className="hidden w-full text-left md:table">
        <thead>
          <tr className="border-b border-line mono-label text-muted">
            <th className="py-2 pr-4 font-normal">Brand</th>
            <th className="py-2 pr-4 font-normal">Posts</th>
            <th className="py-2 pr-4 font-normal">Followers</th>
            <th className="py-2 pr-4 font-normal">Avg eng.</th>
            <th className="py-2 pr-4 font-normal">Eng. rate</th>
            <th className="py-2 pr-4 font-normal">Share of engagement</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.brand.id} className="text-body">
              <td className="py-2.5 pr-3">
                <button
                  type="button"
                  onClick={() => toggle(row.brand.id)}
                  aria-pressed={selected.includes(row.brand.id)}
                  className="inline-flex min-h-9 items-center gap-3 text-left hover:underline"
                >
                  <span className="font-mono text-label text-muted">
                    {String(row.rank).padStart(2, "0")}
                  </span>
                  {row.brand.name}
                </button>
                {delta(row.brand.id)}
                {sampleHint(row)}
              </td>
              <td className="py-2.5 pr-4">{row.posts}</td>
              <td className="py-2.5 pr-4">
                {formatFollowers(row.followers.count)}
                {growth(row)}
              </td>
              <td
                className="py-2.5 pr-4"
                title={
                  row.posts
                    ? `${formatCompact(row.avgLikes)} likes + ${formatCompact(row.avgComments)} comments per post`
                    : undefined
                }
              >
                {row.posts ? formatCompact(row.avgEngagement) : "—"}
              </td>
              <td className="py-2.5 pr-4">{formatRate(row.engagementRate)}</td>
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-3">
                  {bar(row, "w-24 xl:w-28")}
                  <span className="font-mono text-label text-muted">
                    {Math.round(row.share * 100)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: compact list (M02) */}
      <ol className="divide-y divide-line md:hidden">
        {(showAll ? rows : rows.slice(0, MOBILE_ROWS)).map((row) => (
          <li key={row.brand.id}>
            <button
              type="button"
              onClick={() => toggle(row.brand.id)}
              aria-pressed={selected.includes(row.brand.id)}
              className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
            >
              <span className="font-mono text-label text-muted">
                {String(row.rank).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body">
                  {row.brand.name}
                  {delta(row.brand.id)}
                  {sampleHint(row)}
                </span>
                <span className="block font-mono text-label text-muted">
                  {row.followers.count !== null
                    ? `${formatFollowers(row.followers.count)} followers`
                    : "Followers —"}
                  {formatDelta(row.followers.delta) ? ` · ${formatDelta(row.followers.delta)}` : ""}
                </span>
                {bar(row, "mt-1.5 w-full max-w-44")}
              </span>
              <span className="text-right text-body">
                {sortBy === "rate"
                  ? formatRate(row.engagementRate)
                  : row.posts
                    ? formatCompact(row.avgEngagement)
                    : "—"}
                <span className="block font-mono text-label text-muted">
                  {sortBy === "rate"
                    ? row.posts
                      ? formatCompact(row.avgEngagement)
                      : ""
                    : formatRate(row.engagementRate)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {rows.length > MOBILE_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 min-h-11 text-body-sm text-blue hover:underline md:hidden"
        >
          {showAll ? "Show fewer" : `Show all ${plural(rows.length, "brand")}`}
        </button>
      )}

      <p className="mt-4 hidden font-mono text-label text-muted md:block">
        <span className="uppercase">How to read this</span> · Avg engagement = likes + comments per
        post. Eng. rate = that ÷ followers. Longer bar = bigger share. Small sample = fewer than 10
        posts.
      </p>
    </Card>
  );
}
