import { Card } from "../../components/Card";
import type { Platform } from "../../lib/pulls/api";
import { formatCompact, plural } from "../../lib/format";
import type { BrandRef, OverviewPost } from "../overview/metrics";
import { useThumbnails } from "../overview/useOverviewData";
import { PostItem } from "../posts/PostItem";
import {
  cellLabel,
  DAY_PARTS,
  type FormatStat,
  type Heatmap,
  type TagCount,
} from "./social-metrics";

const PLATFORM_NAME: Record<Platform, string> = { instagram: "Instagram", tiktok: "TikTok" };

/**
 * Top posts (06a / 06b / M05). Ranked by likes + comments (TikTok shows views too, never ranked by them).
 * "See all" from Figma is left out until there is an all-posts view to link to.
 * Desktop 4 columns, tablet 2, mobile cards scroll sideways. Soft grey block when there's no thumbnail.
 */
export function SocialTopPosts({
  posts,
  brands,
  platform,
}: {
  posts: OverviewPost[];
  brands: BrandRef[];
  platform: Platform;
}) {
  const thumbs = useThumbnails(posts.map((p) => p.thumbnail_path).filter((p): p is string => !!p));
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "Unknown brand";
  const item = (p: OverviewPost, layout: "grid" | "card") => (
    <PostItem
      key={p.id}
      post={p}
      layout={layout}
      fallback="soft"
      brandName={brandName(p.competitor_id)}
      thumbUrl={(p.thumbnail_path && thumbs.data?.get(p.thumbnail_path)) || undefined}
    />
  );

  return (
    <Card
      title={`Top posts on ${PLATFORM_NAME[platform]}`}
      info={
        platform === "tiktok"
          ? "Ranked by likes + comments. Views are shown but don’t change the order."
          : "Ranked by likes + comments."
      }
    >
      <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
        {posts.slice(0, 4).map((p) => item(p, "grid"))}
      </div>
      {/* `relative` keeps the sr-only "opens in a new tab" labels inside the scroller. */}
      <div className="relative -mx-4 flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 md:hidden">
        {posts.map((p) => item(p, "card"))}
      </div>
    </Card>
  );
}

/** Formats (06a): bar per format, best (≥ 3 posts) in Pop, the rest grey; < 3 posts faded. */
export function FormatsCard({ stats, platform }: { stats: FormatStat[]; platform: Platform }) {
  const max = Math.max(...stats.map((s) => s.avg), 0.0001);
  return (
    <Card
      title="Formats"
      info="Avg likes + comments per post, by format. A format needs at least 3 posts to count as best."
    >
      {stats.length === 0 ? (
        <p className="text-body-sm text-muted">No formats to compare yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {stats.map((s) => (
            <li
              key={s.format}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 md:grid-cols-[7rem_minmax(0,1fr)_auto] ${s.eligible ? "" : "opacity-60"}`}
            >
              <span className="text-body-sm">
                {s.label}
                {s.best && <span className="sr-only"> (best format)</span>}
              </span>
              <span className="text-right whitespace-nowrap md:order-last">
                <span className="text-body-sm font-medium">{formatCompact(s.avg)}</span>{" "}
                <span className="font-mono text-label text-muted">
                  {s.eligible ? plural(s.n, "post") : `${plural(s.n, "post")} · too few`}
                  {platform === "tiktok" && s.avgViews !== null && (
                    <> · {formatCompact(s.avgViews)} views</>
                  )}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="col-span-2 h-2 overflow-hidden rounded-full bg-soft md:col-span-1"
              >
                <span
                  className={`block h-full rounded-full ${s.best ? "bg-pop" : "bg-ink/25"}`}
                  style={{ width: `${(s.avg / max) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Top hashtags (06a): tag + number of posts that used it. */
export function HashtagsCard({ tags }: { tags: TagCount[] }) {
  return (
    <Card title="Top hashtags" info="How many posts used each hashtag in this range.">
      {tags.length === 0 ? (
        <p className="text-body-sm text-muted">No hashtags in these posts.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li
              key={t.tag}
              className="inline-flex min-w-0 items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-small"
            >
              <span className="truncate">#{t.tag}</span>
              <span className="text-label text-muted">
                {t.count}
                <span className="sr-only"> {t.count === 1 ? "post" : "posts"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Best times to post (06a): weekday × day part in US Eastern. Shade = avg likes + comments (ink at
 * opacity), strongest slot (≥ 2 posts) in Pop, empty slots soft grey. Night is a narrow column.
 */
export function BestTimesCard({ map, scope }: { map: Heatmap; scope: string }) {
  const shade = (avg: number) => 0.12 + 0.6 * (avg / (map.max || 1));
  const s = map.strongest;
  return (
    <Card
      title="Best times to post"
      info="Avg likes + comments by when posts went out, in US Eastern time. The strongest slot needs at least 2 posts."
      action={<span className="mono-label text-muted">US Eastern</span>}
    >
      <table className="w-full table-fixed border-separate border-spacing-1">
        <caption className="sr-only">Avg engagement by weekday and time of day, US Eastern</caption>
        <colgroup>
          <col className="w-9" />
          {DAY_PARTS.map((p) => (
            <col key={p.key} className={p.key === "night" ? "w-[12%]" : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th />
            {DAY_PARTS.map((p) => (
              <th
                key={p.key}
                scope="col"
                title={p.range}
                className="pb-1 text-center font-mono text-label font-normal text-muted"
              >
                <span className="md:hidden">{p.key === "midday" ? "Noon" : p.label}</span>
                <span className="hidden md:inline">{p.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {map.rows.map((row) => (
            <tr key={row[0].day}>
              <th scope="row" className="text-left font-mono text-label font-normal text-muted">
                {row[0].day}
              </th>
              {row.map((c) => {
                const strongest = s && s.day === c.day && s.part.key === c.part.key;
                const text = c.n
                  ? `${cellLabel(c)}: ${plural(c.n, "post")}, ${formatCompact(c.avg)} avg`
                  : `${cellLabel(c)}: no posts`;
                return (
                  <td key={c.part.key} title={text} className="p-0">
                    <span
                      className={`block h-5 rounded-sm ${strongest ? "bg-pop" : c.n ? "bg-ink" : "bg-soft"}`}
                      style={c.n && !strongest ? { opacity: shade(c.avg) } : undefined}
                    />
                    <span className="sr-only">
                      {text}
                      {strongest && " (strongest)"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-small text-muted">
        {s
          ? `Strongest slot ${scope}: ${s.day} ${s.part.long} (${s.part.range}).`
          : "Not enough posts to pick a strongest slot yet (a slot needs at least 2 posts)."}
      </p>
    </Card>
  );
}
