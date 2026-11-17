import { Link, useLocation } from "react-router";
import { compareColor } from "../../lib/brand-selection";
import { useBrandSelection } from "../../lib/brand-selection-context";
import { PostsCard } from "../posts/PostsCard";
import { platformHref } from "./filters";
import type { BrandRef, OverviewPost } from "./metrics";

const link =
  "inline-flex min-h-11 items-center gap-1 text-body-sm whitespace-nowrap text-blue hover:underline md:min-h-6";

/**
 * Top posts (04 / M02): top 3 rows on tablet/desktop, 6 sideways cards on mobile, ranked by likes +
 * comments. Never expands here: "All Instagram posts →" / "All TikTok posts →" open that platform page
 * with Top posts expanded (?posts=all), keeping the date range and brand selection.
 */
export function TopPostsCard({
  posts,
  brands,
  newIds,
}: {
  /** every post in the current filters */
  posts: OverviewPost[];
  brands: BrandRef[];
  newIds?: Set<string>;
}) {
  const { selected } = useBrandSelection();
  const { search } = useLocation();
  return (
    <PostsCard
      title="Top posts"
      posts={posts}
      brands={brands}
      desktop="rows"
      collapsedCount={3}
      mobileCount={6}
      newIds={newIds}
      colorFor={(id) => (selected.length >= 2 ? compareColor(selected, id) : null)}
      footer={() => "Ranked by likes + comments."}
      links={
        <>
          <Link to={platformHref("instagram", search, { posts: "all" })} className={link}>
            All Instagram posts <span aria-hidden="true">→</span>
          </Link>
          <Link to={platformHref("tiktok", search, { posts: "all" })} className={link}>
            All TikTok posts <span aria-hidden="true">→</span>
          </Link>
        </>
      }
    />
  );
}
