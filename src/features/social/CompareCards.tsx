import type { ReactNode } from "react";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { COMPARE_COLORS, type CompareColor } from "../../lib/brand-selection";
import { formatCompact } from "../../lib/format";
import { SMALL_SAMPLE, type BrandRef } from "../overview/metrics";
import type { FormatCompareRow, HeadToHeadColumn, OverlapColumn } from "./social-metrics";

const FILL: Record<CompareColor, string> = { ink: "bg-ink", pop: "bg-pop", blue: "bg-blue" };
/** Selection order = compare colour order (ink, Pop, Blue), as on the pills. */
const colorAt = (i: number) => COMPARE_COLORS[i] ?? "ink";

function Dot({ color }: { color: CompareColor }) {
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${FILL[color]}`} />;
}

/** Head to head (06c / M06). Mobile: shorter labels, no top hashtag row, best time as "Tue eve". */
export function HeadToHeadCard({ cols, days }: { cols: HeadToHeadColumn[]; days: number }) {
  const ahead = (on: boolean) =>
    on ? (
      <Chip tone="ok" className="ml-2">
        ahead
      </Chip>
    ) : null;
  const rows: {
    key: string;
    label: string;
    short: string;
    desktopOnly?: boolean;
    cell: (c: HeadToHeadColumn) => ReactNode;
  }[] = [
    {
      key: "posts",
      label: `Posts (${days} days)`,
      short: "Posts",
      cell: (c) => (
        <>
          {c.posts}
          {ahead(c.aheadPosts)}
          {c.smallSample && (
            <span
              title={`Fewer than ${SMALL_SAMPLE} posts in this range — averages can swing a lot`}
              className="ml-2 hidden rounded-sm bg-soft px-1 font-mono text-label whitespace-nowrap text-muted md:inline"
            >
              small sample
            </span>
          )}
        </>
      ),
    },
    {
      key: "eng",
      label: "Avg engagement / post",
      short: "Avg eng.",
      cell: (c) => (
        <>
          {c.posts ? formatCompact(c.avgEngagement) : "—"}
          {ahead(c.aheadEngagement)}
        </>
      ),
    },
    { key: "format", label: "Best format", short: "Best format", cell: (c) => c.bestFormat },
    {
      key: "time",
      label: "Best time to post",
      short: "Best time",
      cell: (c) => (
        <>
          <span className="md:hidden">{c.bestTimeShort}</span>
          <span className="hidden md:inline">{c.bestTime}</span>
        </>
      ),
    },
    {
      key: "tag",
      label: "Top hashtag",
      short: "Top hashtag",
      desktopOnly: true,
      cell: (c) => (c.topTag ? `#${c.topTag}` : "—"),
    },
  ];

  return (
    <section className="overflow-x-auto rounded-card border border-line bg-surface p-4 md:p-6">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="pb-3 align-bottom font-normal">
              <h2 className="text-card">Head to head</h2>
            </th>
            {cols.map((c, i) => (
              <th
                key={c.brand.id}
                scope="col"
                className="pb-3 pl-3 align-bottom text-small font-normal md:w-1/5 md:text-body-sm"
              >
                <span className="flex items-center gap-2">
                  <Dot color={colorAt(i)} />
                  <span className="truncate">{c.brand.name}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className={`border-b border-line last:border-0 ${r.desktopOnly ? "hidden md:table-row" : ""}`}
            >
              <th scope="row" className="py-3 text-small font-normal text-muted">
                <span className="md:hidden">{r.short}</span>
                <span className="hidden md:inline">{r.label}</span>
              </th>
              {cols.map((c) => (
                <td key={c.brand.id} className="py-3 pl-3 text-body-sm md:text-body">
                  {r.cell(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Formats side by side (06c / M06): one bar per brand in its compare colour. */
export function FormatsSideBySideCard({
  rows,
  brands,
}: {
  rows: FormatCompareRow[];
  brands: BrandRef[];
}) {
  const max = Math.max(...rows.flatMap((r) => r.values.map((v) => v.avg)), 0.0001);
  const legend = brands
    .map((b, i) => `${["Ink", "pink", "blue"][i] ?? "Ink"} = ${b.name}`)
    .join(", ");
  return (
    <Card title="Formats, side by side" className="flex flex-col">
      {rows.length === 0 ? (
        <p className="text-body-sm text-muted">No formats to compare yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <li key={r.format}>
              <p className="mb-1.5 text-body-sm">{r.label}</p>
              <ul className="flex flex-col gap-1">
                {r.values.map((v, i) => {
                  const name = brands[i]?.name ?? "";
                  return (
                    <li
                      key={v.brandId}
                      className={`flex items-center gap-2 ${v.n > 0 && !v.eligible ? "opacity-60" : ""}`}
                    >
                      <span className="sr-only">{name}: </span>
                      <span
                        aria-hidden="true"
                        className={`h-3 shrink-0 rounded-full ${v.n ? FILL[colorAt(i)] : ""}`}
                        style={{ width: `${(v.avg / max) * 75}%` }}
                      />
                      <span className="font-mono text-label whitespace-nowrap text-muted">
                        {v.n === 0
                          ? "no posts"
                          : `${formatCompact(v.avg)}${v.eligible ? "" : ` · ${v.n} ${v.n === 1 ? "post" : "posts"}, too few`}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-auto hidden pt-6 font-mono text-label text-muted md:block">
        <span className="uppercase">How to read this</span> · Avg likes + comments per post.{" "}
        {legend}.
      </p>
    </Card>
  );
}

/** Hashtags: who uses what (06c). 2 brands: Only A · Both · Only B. 3 brands: Only A/B/C · Shared. */
export function HashtagOverlapCard({
  columns,
  brands,
}: {
  columns: OverlapColumn[];
  brands: BrandRef[];
}) {
  const color = (id: string) => colorAt(brands.findIndex((b) => b.id === id));
  return (
    <Card title="Hashtags: who uses what" className="flex flex-col">
      <div
        className={`grid grid-cols-[minmax(0,1fr)] gap-3 ${columns.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}
      >
        {columns.map((col) => {
          const shared = col.brandIds.length > 1;
          return (
            <div
              key={col.key}
              className={`self-start rounded-control border border-line p-3 ${shared ? "bg-soft" : ""}`}
            >
              <p className="mb-2 flex items-center gap-1.5 text-small">
                {col.brandIds.map((id) => (
                  <Dot key={id} color={color(id)} />
                ))}
                <span className="ml-0.5 truncate">{col.label}</span>
              </p>
              {col.tags.length === 0 ? (
                <p className="text-small text-muted">None</p>
              ) : (
                <ul className="flex flex-col gap-1.5 font-mono text-small">
                  {col.tags.map((t) => (
                    <li key={t.tag} className="truncate" title={`#${t.tag} · ${t.count} posts`}>
                      #{t.tag}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-auto pt-6 text-small text-muted">
        Shared tags = where you compete for the same audience.
      </p>
    </Card>
  );
}
