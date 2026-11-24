import { Link, useLocation } from "react-router";
import { compareColor } from "../../lib/brand-selection";
import { PLATFORM_NAME } from "../../lib/platforms";
import { useVisiblePlatforms } from "../../lib/useVisiblePlatforms";
import { useBrandSelection } from "../../lib/brand-selection-context";
import { PostsCard } from "../posts/PostsCard";
import { platformHref } from "./filters";
import type { BrandRef, OverviewPost } from "./metrics";

const link =
  "inline-flex min-h-11 items-center gap-1 text-body-sm whitespace-nowrap text-blue hover:underline md:min-h-6";

/**
 * Top posts (04 / M02): top 3 rows on tablet/desktop, 6 sideways cards on mobile, ranked by likes +
 * comments. Never expands here: "All Instagram / … / Facebook posts →" open that platform page with Top
 * posts expanded (?posts=all), keeping the date range and brand selection. Only platforms a competitor
 * has an account on (16b). The tablet/desktop header shows just the platform name; the link's name stays
 * "All … posts".
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
  const visible = useVisiblePlatforms(); // only platforms a competitor has an account on (16b)
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
          {visible.map((p) => (
            <Link key={p} to={platformHref(p, search, { posts: "all" })} className={link}>
              {/* Header on tablet/desktop is short ("LinkedIn →"); phones stack the full label. */}
              <span className="md:sr-only">All </span>
              {PLATFORM_NAME[p]}
              <span className="md:sr-only"> posts</span> <span aria-hidden="true">→</span>
            </Link>
          ))}
        </>
      }
    />
  );
}
