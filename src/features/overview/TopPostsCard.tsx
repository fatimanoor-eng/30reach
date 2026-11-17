import { compareColor } from "../../lib/brand-selection";
import { useBrandSelection } from "../../lib/brand-selection-context";
import { PostsCard } from "../posts/PostsCard";
import type { BrandRef, OverviewPost } from "./metrics";

/**
 * Top posts (04 / M02): top 3 rows on tablet/desktop, 6 sideways cards on mobile, ranked by likes +
 * comments. "See all" expands in place to every post in the current filters (Top / Newest).
 * Thumbnail = saved copy in post-thumbs (signed URL), else a block with the format tag.
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
      footer={(sort, expanded) =>
        expanded && sort === "newest"
          ? "Newest first. Likes + comments under each post."
          : "Ranked by likes + comments."
      }
    />
  );
}
