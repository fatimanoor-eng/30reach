import { useState } from "react";
import { Card } from "../../components/Card";
import { compareColor, type CompareColor } from "../../lib/brand-selection";
import { useBrandSelection } from "../../lib/brand-selection-context";
import { formatCompact, plural } from "../../lib/format";
import type { LeaderRow } from "./metrics";

const FILL: Record<CompareColor, string> = { ink: "bg-ink", pop: "bg-pop", blue: "bg-blue" };
const MOBILE_ROWS = 4;

/**
 * Leaderboard (04 / M02): sorted by avg engagement = (likes + comments) / posts.
 * Click a brand = select its pill. Bars: #1 ink, others grey; in compare mode the brands' compare colours.
 * ▲/▼ = rank change since the previous pull (05e).
 */
export function LeaderboardCard({
  rows,
  rankDelta,
}: {
  rows: LeaderRow[];
  rankDelta?: Map<string, number>;
}) {
  const { selected, toggle } = useBrandSelection();
  const [showAll, setShowAll] = useState(false);
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
      <span className={`ml-2 font-mono text-label ${d > 0 ? "text-fresh" : "text-spark"}`}>
        <span aria-hidden="true">{d > 0 ? "▲" : "▼"}</span> {Math.abs(d)}
        <span className="sr-only"> {d > 0 ? "up" : "down"} since the last pull</span>
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
      title="Leaderboard"
      action={
        <span className="hidden font-mono text-small text-muted md:inline">
          Sorted by avg engagement
        </span>
      }
    >
      {/* Tablet / desktop: full table */}
      <table className="hidden w-full text-left md:table">
        <thead>
          <tr className="border-b border-line mono-label text-muted">
            <th className="py-2 font-normal">Brand</th>
            <th className="py-2 font-normal">Posts</th>
            <th className="py-2 font-normal">Avg likes</th>
            <th className="py-2 font-normal">Avg comments</th>
            <th className="py-2 font-normal">Share of engagement</th>
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
              </td>
              <td className="py-2.5">{row.posts}</td>
              <td className="py-2.5">{row.posts ? formatCompact(row.avgLikes) : "—"}</td>
              <td className="py-2.5">{row.posts ? formatCompact(row.avgComments) : "—"}</td>
              <td className="py-2.5">
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
                </span>
                {bar(row, "mt-1.5 w-full max-w-44")}
              </span>
              <span className="text-body">
                {row.posts ? formatCompact(row.avgEngagement) : "—"}
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
        post. Longer bar = bigger share.
      </p>
    </Card>
  );
}
