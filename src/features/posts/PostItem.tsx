import { ExternalLink } from "lucide-react";
import type { CompareColor } from "../../lib/brand-selection";
import { formatShortDate } from "../../lib/format";
import { PLATFORM_FILL, PLATFORM_ICON, PLATFORM_NAME } from "../../lib/platforms";
import { type OverviewPost, postStats } from "../overview/metrics";
import { isSaveable, useSaveAsIdea } from "./save-as-idea";

const DOT: Record<CompareColor, string> = { ink: "bg-ink", pop: "bg-pop", blue: "bg-blue" };
const FORMAT_TAG: Record<string, string> = {
  reel: "Reel",
  carousel: "Carousel", // Facebook: "Album" (formatTag)
  image: "Image",
  video: "Video",
  text: "Text",
  document: "Document",
  article: "Link",
  poll: "Poll",
};

/**
 * One post (Overview top posts, Social top posts).
 * • row  — Overview desktop list: small thumbnail left, text right.
 * • card — mobile sideways scroll: ~220 px wide, the next one peeks in.
 * • grid — Social grid (06a/06b): full-width 92 px thumbnail strip on top (as in Figma).
 * Thumbnail = saved copy (signed URL), else a block with the format tag (Overview: platform colour,
 * Social: soft grey, as in the Figma frames). LinkedIn's Blue and Facebook's Fresh are dark, so their
 * tag always sits on a white chip. "Save as idea" isn't offered on Facebook posts until ideas know
 * Facebook (Slice 16c).
 */
export function PostItem({
  post: p,
  layout,
  brandName,
  color,
  thumbUrl,
  isNew = false,
  fallback = "platform",
}: {
  post: OverviewPost;
  layout: "row" | "card" | "grid";
  brandName: string;
  color?: CompareColor | null;
  thumbUrl?: string;
  isNew?: boolean;
  fallback?: "platform" | "soft";
}) {
  const saveAsIdea = useSaveAsIdea();
  const Icon = PLATFORM_ICON[p.platform];
  const row = layout === "row";
  const tag =
    p.platform === "facebook" && p.format === "carousel"
      ? "Album"
      : (FORMAT_TAG[p.format ?? ""] ?? "Post");
  const fill = fallback === "soft" ? "bg-soft" : PLATFORM_FILL[p.platform];
  // Tag on a white chip: always on grid / card, and on the dark Blue (LinkedIn) / Fresh (Facebook) blocks.
  const chip = !row || fill === "bg-blue" || fill === "bg-fresh";

  return (
    <article
      className={
        layout === "card"
          ? "flex w-55 shrink-0 snap-start flex-col gap-3"
          : layout === "grid"
            ? "flex min-w-0 flex-col gap-3"
            : "flex gap-4 py-4 first:pt-0 last:pb-0"
      }
    >
      <div
        className={`relative shrink-0 overflow-hidden rounded-control ${row ? "h-22 w-18" : layout === "grid" ? "h-23 w-full" : "aspect-[4/3] w-full"} ${fill}`}
      >
        {thumbUrl && (
          <img src={thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
        )}
        {isNew && (
          <span className="absolute top-1.5 left-1.5 rounded-sm bg-flash px-1 font-mono text-label text-ink uppercase">
            New
          </span>
        )}
        {(!thumbUrl || !row) && (
          <span
            className={`absolute font-mono text-label text-ink uppercase ${
              row
                ? `bottom-1.5 left-1.5 ${chip ? "rounded-sm bg-surface px-1" : ""}`
                : `${isNew ? "top-7" : "top-1.5"} left-1.5 rounded-sm bg-surface px-1`
            }`}
          >
            {tag}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-mono text-label text-muted">
          <Icon size={14} aria-label={PLATFORM_NAME[p.platform]} />
          {color && (
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[color]}`} />
          )}
          <span className="truncate">{brandName}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{formatShortDate(p.posted_at)}</span>
        </p>
        <p className="mt-1 line-clamp-2 text-body">{p.caption?.trim() || "No caption"}</p>
        <p className="mt-1 text-small text-muted">{postStats(p)}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-small">
          {isSaveable(p) && (
            <button
              type="button"
              onClick={() => saveAsIdea({ post: p, brandName, thumbUrl })}
              className="min-h-11 text-blue hover:underline md:min-h-6"
            >
              Save as idea
            </button>
          )}
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
}
