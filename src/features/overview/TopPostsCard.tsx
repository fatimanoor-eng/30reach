import { ChevronDown } from "lucide-react";
import { Link, useLocation } from "react-router";
import { compareColor } from "../../lib/brand-selection";
import { PLATFORM_NAME, type Platform } from "../../lib/platforms";
import { usePopover } from "../../lib/usePopover";
import { useVisiblePlatforms } from "../../lib/useVisiblePlatforms";
import { useBrandSelection } from "../../lib/brand-selection-context";
import { PostsCard } from "../posts/PostsCard";
import { useClientPath } from "../../lib/useClient";
import { platformHref } from "./filters";
import type { BrandRef, OverviewPost } from "./metrics";

const link =
  "inline-flex min-h-11 items-center gap-1 text-body-sm whitespace-nowrap text-blue hover:underline md:min-h-6";

/**
 * Top posts (04 / M02): top 3 rows on tablet/desktop, 6 sideways cards on mobile, ranked by likes +
 * comments. Never expands here: each platform's "All … posts" opens that platform page with Top posts
 * expanded (?posts=all), keeping the date range and brand selection. Only platforms a competitor has an
 * account on (16b). Phones stack the links under the cards; tablet/desktop show one "See all ▾" that
 * opens a small menu of them (5+ platforms overflowed the header as a row of links).
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
  const path = useClientPath();
  const visible = useVisiblePlatforms(); // only platforms a competitor has an account on (16b)
  const hrefFor = (p: Platform) => path(platformHref(p, search, { posts: "all" }));
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
      headerLinks={visible.length > 0 && <SeeAllMenu platforms={visible} hrefFor={hrefFor} />}
      links={
        <>
          {visible.map((p) => (
            <Link key={p} to={hrefFor(p)} className={link}>
              All {PLATFORM_NAME[p]} posts <span aria-hidden="true">→</span>
            </Link>
          ))}
        </>
      }
    />
  );
}

/** "See all ▾" → a small menu with one link per platform (tablet/desktop header). */
function SeeAllMenu({
  platforms,
  hrefFor,
}: {
  platforms: Platform[];
  hrefFor: (p: Platform) => string;
}) {
  const { open, toggle, close, wrapRef, triggerRef, panelId } = usePopover();
  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        className="inline-flex min-h-11 items-center gap-1 text-body-sm whitespace-nowrap text-blue hover:underline md:min-h-6"
      >
        See all
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul
          id={panelId}
          aria-label="See all posts on"
          className="absolute top-full right-0 z-40 mt-1 min-w-48 rounded-card border border-line bg-surface p-1 shadow-xl"
        >
          {platforms.map((p) => (
            <li key={p}>
              <Link
                to={hrefFor(p)}
                onClick={close}
                className="flex min-h-11 items-center justify-between gap-3 rounded-control px-3 text-body-sm text-ink hover:bg-bg"
              >
                All {PLATFORM_NAME[p]} posts <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
