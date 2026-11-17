import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Card } from "../../components/Card";
import { SegmentedControl } from "../../components/SegmentedControl";
import type { CompareColor } from "../../lib/brand-selection";
import { plural } from "../../lib/format";
import type { BrandRef, OverviewPost } from "../overview/metrics";
import { useThumbnails } from "../overview/useOverviewData";
import { PostItem } from "./PostItem";
import { type PostSort, sortPosts } from "./post-sort";

const linkButton =
  "inline-flex min-h-11 shrink-0 items-center text-body-sm text-blue hover:underline md:min-h-6";

/**
 * Top posts card (Overview 04 / M02, Instagram + TikTok 06a / 06b / M05).
 * Collapsed: the top few by likes + comments — desktop as rows (Overview) or a grid (Social), mobile
 * as cards that scroll sideways. "See all" expands the card in place to every post in the current
 * filters with a Top / Newest sort; on mobile the expanded list is vertical. "Show less" collapses it.
 * Expanded state can be controlled (Instagram / TikTok keep it in the URL: ?posts=all). Overview
 * doesn't expand: it passes `links` instead (header on tablet/desktop, stacked under the cards on mobile).
 */
export function PostsCard({
  title,
  info,
  posts,
  brands,
  desktop,
  collapsedCount,
  mobileCount,
  newIds,
  colorFor,
  fallback,
  footer,
  expanded: expandedProp,
  onExpandedChange,
  links,
  scrollIntoViewOnMount = false,
}: {
  title: string;
  info?: string;
  /** every post in the current filters (any order) */
  posts: OverviewPost[];
  brands: BrandRef[];
  desktop: "rows" | "grid";
  /** posts shown collapsed on tablet/desktop */
  collapsedCount: number;
  /** cards in the collapsed mobile scroller */
  mobileCount: number;
  newIds?: Set<string>;
  colorFor?: (competitorId: string) => CompareColor | null;
  fallback?: "platform" | "soft";
  /** small "how to read this" line under the posts (tablet/desktop), given the current sort */
  footer?: (sort: PostSort, expanded: boolean) => string;
  /** controlled expanded state (optional) */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** replaces "See all": the card never expands */
  links?: ReactNode;
  /** arrived via a link to the expanded list: bring the card into view once */
  scrollIntoViewOnMount?: boolean;
}) {
  const [expandedState, setExpandedState] = useState(false);
  const expanded = !links && (expandedProp ?? expandedState);
  const setExpanded = (v: boolean) => {
    setExpandedState(v);
    onExpandedChange?.(v);
  };
  const [sort, setSort] = useState<PostSort>("top");
  const headerButton = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const ranked = sortPosts(posts, "top");
  const all = expanded ? sortPosts(posts, sort) : [];
  const collapsed = ranked.slice(0, Math.max(collapsedCount, mobileCount));
  const visible = expanded ? all : collapsed;
  const thumbs = useThumbnails(
    visible.map((p) => p.thumbnail_path).filter((p): p is string => !!p),
  );
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "Unknown brand";
  const canExpand =
    !links && (expanded || posts.length > collapsedCount || posts.length > mobileCount);

  // Only on arrival (mount), not when "See all" is pressed on the page.
  const scrollOnArrival = useRef(scrollIntoViewOnMount);
  useEffect(() => {
    if (scrollOnArrival.current) headerButton.current?.scrollIntoView({ block: "start" });
  }, []);

  const item = (p: OverviewPost, layout: "row" | "card" | "grid") => (
    <PostItem
      key={p.id}
      post={p}
      layout={layout}
      fallback={fallback}
      brandName={brandName(p.competitor_id)}
      color={colorFor?.(p.competitor_id) ?? null}
      thumbUrl={(p.thumbnail_path && thumbs.data?.get(p.thumbnail_path)) || undefined}
      isNew={newIds?.has(p.id)}
    />
  );
  const rows = (list: OverviewPost[], className = "") => (
    <div className={`divide-y divide-line ${className}`}>{list.map((p) => item(p, "row"))}</div>
  );
  const grid = (list: OverviewPost[]) => (
    <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
      {list.map((p) => item(p, "grid"))}
    </div>
  );

  const collapse = () => {
    setExpanded(false);
    // From the bottom "Show less", bring the card's header back into view and keep focus there.
    headerButton.current?.focus({ preventScroll: true });
    headerButton.current?.scrollIntoView({ block: "start" });
  };

  return (
    <Card
      title={title}
      info={info}
      action={
        links ? (
          <div className="hidden items-center gap-4 md:flex">{links}</div>
        ) : canExpand ? (
          <button
            ref={headerButton}
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => (expanded ? collapse() : setExpanded(true))}
            // scroll-margin: when "Show less" scrolls back here, land below the sticky mobile app bar.
            className={`${linkButton} scroll-mt-24 md:scroll-mt-6`}
          >
            {expanded ? "Show less" : "See all"}
          </button>
        ) : undefined
      }
    >
      <div id={listId}>
        {expanded ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-small text-muted">{plural(posts.length, "post")}</p>
              <SegmentedControl
                label="Sort posts"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "top", label: "Top" },
                  { value: "newest", label: "Newest" },
                ]}
              />
            </div>
            {desktop === "rows" ? (
              rows(all)
            ) : (
              <>
                {grid(all)}
                {rows(all, "md:hidden")}
              </>
            )}
            {all.length > collapsedCount && (
              <div className="mt-4 flex justify-center border-t border-line pt-3">
                <button type="button" onClick={collapse} className={linkButton}>
                  Show less
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {desktop === "rows"
              ? rows(collapsed.slice(0, collapsedCount), "hidden md:block")
              : grid(collapsed.slice(0, collapsedCount))}
            {/* `relative` keeps absolutely positioned children (the sr-only "opens in a new tab"
                labels) inside the scroller — otherwise they escape and widen the page. */}
            <div className="relative -mx-4 flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 md:hidden">
              {collapsed.slice(0, mobileCount).map((p) => item(p, "card"))}
            </div>
            {links && <div className="mt-3 flex flex-col md:hidden">{links}</div>}
          </>
        )}
      </div>
      {footer && (
        <p className="mt-4 hidden font-mono text-label text-muted md:block">
          <span className="uppercase">How to read this</span> · {footer(sort, expanded)}
        </p>
      )}
    </Card>
  );
}
