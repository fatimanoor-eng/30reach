import { Link, useLocation } from "react-router";
import { Card } from "../../components/Card";
import { compareColor } from "../../lib/brand-selection";
import { useBrandSelection } from "../../lib/brand-selection-context";
import type { BrandRef, OverviewPost } from "./metrics";
import { PostItem } from "../posts/PostItem";
import { useThumbnails } from "./useOverviewData";

/**
 * Top posts (04): ranked by likes + comments. Thumbnail = saved copy in post-thumbs (signed URL), else a
 * soft block with the format tag. "Save as idea" → Slice 10. "Open post" → original URL in a new tab.
 * Mobile: cards scroll sideways, ~220 px wide with the next one peeking in.
 */
export function TopPostsCard({
  posts,
  brands,
  newIds,
}: {
  posts: OverviewPost[];
  brands: BrandRef[];
  newIds?: Set<string>;
}) {
  const { search } = useLocation();
  const thumbs = useThumbnails(posts.map((p) => p.thumbnail_path).filter((p): p is string => !!p));
  const { selected } = useBrandSelection();
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "Unknown brand";

  const item = (p: OverviewPost, layout: "row" | "card") => (
    <PostItem
      key={p.id}
      post={p}
      layout={layout}
      brandName={brandName(p.competitor_id)}
      color={selected.length >= 2 ? compareColor(selected, p.competitor_id) : null}
      thumbUrl={(p.thumbnail_path && thumbs.data?.get(p.thumbnail_path)) || undefined}
      isNew={newIds?.has(p.id)}
    />
  );

  return (
    <Card
      title="Top posts"
      action={
        <Link
          to={`/instagram${search}`}
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
