import { ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { Card } from "../../components/Card";
import { InstagramIcon, TikTokIcon } from "../../components/icons/BrandIcons";
import { useToast } from "../../components/toast-context";
import { compareColor, type CompareColor } from "../../lib/brand-selection";
import { useBrandSelection } from "../../lib/brand-selection-context";
import { formatShortDate } from "../../lib/format";
import type { BrandRef, OverviewPost, PlatformFilter } from "./metrics";
import { postStats } from "./metrics";
import { useThumbnails } from "./useOverviewData";

const DOT: Record<CompareColor, string> = { ink: "bg-ink", pop: "bg-pop", blue: "bg-blue" };
const FORMAT_TAG: Record<string, string> = {
  reel: "Reel",
  carousel: "Carousel",
  image: "Image",
  video: "Video",
};

/**
 * Top posts (04): ranked by likes + comments. Thumbnail = saved copy in post-thumbs (signed URL), else a
 * soft block with the format tag. "Save as idea" → Slice 10. "Open post" → original URL in a new tab.
 * Mobile: cards scroll sideways, ~220 px wide with the next one peeking in.
 */
export function TopPostsCard({
  posts,
  brands,
  newIds,
  platform,
}: {
  posts: OverviewPost[];
  brands: BrandRef[];
  newIds?: Set<string>;
  platform: PlatformFilter;
}) {
  const thumbs = useThumbnails(posts.map((p) => p.thumbnail_path).filter((p): p is string => !!p));
  const toast = useToast();
  const { selected } = useBrandSelection();
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "Unknown brand";
  const saveAsIdea = () =>
    toast.show({
      title: "Saving ideas arrives in Slice 10",
      detail: "For now, use Open post to see it on the platform.",
      pose: "idle",
    });

  const item = (p: OverviewPost, layout: "row" | "card") => {
    const color = selected.length >= 2 ? compareColor(selected, p.competitor_id) : null;
    const Icon = p.platform === "tiktok" ? TikTokIcon : InstagramIcon;
    const thumb = p.thumbnail_path ? thumbs.data?.get(p.thumbnail_path) : undefined;
    const card = layout === "card";
    return (
      <article
        key={p.id}
        className={
          card
            ? "flex w-55 shrink-0 snap-start flex-col gap-3"
            : "flex gap-4 py-4 first:pt-0 last:pb-0"
        }
      >
        <div
          className={`relative shrink-0 overflow-hidden rounded-control ${card ? "aspect-[4/5] w-full" : "h-22 w-18"} ${
            p.platform === "tiktok" ? "bg-breeze" : "bg-pop"
          }`}
        >
          {thumb && <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />}
          {newIds?.has(p.id) && (
            <span className="absolute top-1.5 left-1.5 rounded-sm bg-flash px-1 font-mono text-label text-ink uppercase">
              New
            </span>
          )}
          {!thumb && (
            <span className="absolute bottom-1.5 left-1.5 font-mono text-label text-ink uppercase">
              {FORMAT_TAG[p.format ?? ""] ?? "Post"}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-mono text-label text-muted">
            <Icon size={14} aria-label={p.platform === "tiktok" ? "TikTok" : "Instagram"} />
            {color && <span aria-hidden="true" className={`size-2 rounded-full ${DOT[color]}`} />}
            <span className="truncate">{brandName(p.competitor_id)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatShortDate(p.posted_at)}</span>
          </p>
          <p className="mt-1 line-clamp-2 text-body">{p.caption?.trim() || "No caption"}</p>
          <p className="mt-1 text-small text-muted">{postStats(p)}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-small">
            <button
              type="button"
              onClick={saveAsIdea}
              className="min-h-11 text-blue hover:underline md:min-h-6"
            >
              Save as idea
            </button>
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-blue hover:underline md:min-h-6"
            >
              Open post <ExternalLink size={12} aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </p>
        </div>
      </article>
    );
  };

  return (
    <Card
      title="Top posts"
      action={
        <Link
          to={platform === "tiktok" ? "/tiktok" : "/instagram"}
          className="inline-flex min-h-11 items-center text-body-sm text-blue hover:underline md:min-h-6"
        >
          See all
        </Link>
      }
    >
      {/* Tablet / desktop: top 3 as rows */}
      <div className="hidden divide-y divide-line md:block">
        {posts.slice(0, 3).map((p) => item(p, "row"))}
      </div>
      {/* Mobile: sideways scroll. `relative` keeps absolutely positioned children (the sr-only
          "opens in a new tab" labels) inside the scroller — otherwise they escape and widen the page. */}
      <div className="relative -mx-4 flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 md:hidden">
        {posts.map((p) => item(p, "card"))}
      </div>
      <p className="mt-4 hidden font-mono text-label text-muted md:block">
        <span className="uppercase">How to read this</span> · Ranked by likes + comments.
      </p>
    </Card>
  );
}
