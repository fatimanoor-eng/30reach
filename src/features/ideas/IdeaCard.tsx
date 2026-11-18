import { CalendarDays, ImageIcon, Link2, StickyNote } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router";
import { Chip } from "../../components/Chip";
import { InstagramIcon, TikTokIcon } from "../../components/icons/BrandIcons";
import { formatCompact, formatShortDate } from "../../lib/format";
import { AiTag } from "../calendar/CardTile";
import {
  formatLabel,
  hasPicture,
  ideaAge,
  ideaAuthor,
  ideaText,
  linkLabel,
  plannedLabel,
  type Idea,
  type IdeaPlatform,
  type TileSize,
} from "./idea-rules";

function PlatformIcon({ platform }: { platform: IdeaPlatform | null }) {
  if (platform === "instagram")
    return (
      <InstagramIcon
        size={14}
        aria-label="Instagram"
        role="img"
        aria-hidden={false}
        className="shrink-0"
      />
    );
  if (platform === "tiktok")
    return (
      <TikTokIcon
        size={14}
        aria-label="TikTok"
        role="img"
        aria-hidden={false}
        className="shrink-0"
      />
    );
  return null;
}

/** "Planned · Tue 5 Jan" (14b) / "Planned · 5 Jan" (M09). Opens that calendar card. */
function PlannedBadge({ planned }: { planned: NonNullable<Idea["planned"]> }) {
  return (
    <Link
      to={`/calendar?date=${planned.date}&card=${planned.id}`}
      className="relative z-10 -my-3 inline-flex min-h-11 shrink-0 items-center self-start md:my-0 md:min-h-0"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-2 py-0.5 text-label font-medium text-white hover:bg-sidebar-2">
        <span
          aria-hidden="true"
          className="hidden size-1.5 rounded-full bg-fresh md:inline-block"
        />
        Planned · <span className="md:hidden">{plannedLabel(planned.date, true)}</span>
        <span className="hidden md:inline">{plannedLabel(planned.date)}</span>
      </span>
    </Link>
  );
}

/** The picture fills its slot (object-fit: cover; the full image is in the detail view). */
function Picture({ url, label, className }: { url?: string; label: string; className: string }) {
  if (url)
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className={`rounded-control bg-soft object-cover object-top ${className}`}
      />
    );
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1.5 rounded-control bg-soft ${className}`}
    >
      <ImageIcon size={20} aria-hidden="true" />
      <span className="hidden mono-label md:inline">{label}</span>
    </div>
  );
}

/*
 * How many lines of text fit, so the clamp's ellipsis always lands on a whole line.
 * Space = row height − padding − footer − the gaps, minus a header line, the Planned badge and the
 * tags row when the tile shows them. Phones: 150 px rows, 13 px text. From 768 px: 180 px rows,
 * 15 px text (14 px beside a picture, 24 px on the 2×2 feature without one).
 */
const MOBILE = { row: 150, gap: 10, pad: 24, footer: 14 + 8, line: 18.2, header: 24, badge: 28 };
const WIDE = { row: 180, gap: 16, pad: 28, footer: 23 + 10, header: 28, badge: 30, tags: 32 };

function linesThatFit(
  size: TileSize,
  {
    header,
    badge,
    tags,
    stats,
    big,
  }: Record<"header" | "badge" | "tags" | "stats" | "big", boolean>,
) {
  const rows = size === "1x2" || size === "2x2" ? 2 : 1;
  const m = MOBILE;
  let mobile = rows * m.row + (rows - 1) * m.gap - m.pad - m.footer;
  if (header) mobile -= m.header;
  if (badge) mobile -= m.badge;
  const w = WIDE;
  let wide = rows * w.row + (rows - 1) * w.gap - w.pad - w.footer;
  if (header) wide -= w.header;
  if (badge) wide -= w.badge;
  if (tags) wide -= w.tags;
  if (stats) wide -= 29;
  const lineWide = big ? 28.8 : size === "2x1" ? 20.3 : 21.75;
  return {
    mobile: Math.max(1, Math.floor(mobile / m.line)),
    wide: Math.max(1, Math.floor(wide / lineWide)),
  };
}

/**
 * One idea as a bento tile (14b / M09). Fixed size from `size`:
 * • 1×1 — header, text, footer (no picture, no tags: they're in the detail view)
 * • 2×1 — landscape picture on the left, text + tags on the right
 * • 1×2 / 2×2 — picture on top (if any), then text, tags and footer
 * Notes are Bloom tiles without a border. Phones keep M09's shorter footer and no tags.
 */
export function IdeaCard({
  idea,
  size,
  imageUrl,
  now,
  onOpen,
}: {
  idea: Idea;
  size: TileSize;
  imageUrl?: string;
  /** "2 days ago" is worked out from this (the page time, so all tiles agree). */
  now: number;
  /** Open the 14c detail; `plan` = straight into Plan it (the tile's "Plan it" link). */
  onOpen: (plan: boolean) => void;
}) {
  const text = ideaText(idea);
  const snap = idea.source_snapshot;
  const isNote = idea.kind === "note";
  const picture = hasPicture(idea);
  const format = formatLabel(idea.format ?? snap?.format);
  const brand = snap?.brand?.toUpperCase();
  const stats =
    idea.kind === "post" && snap
      ? [
          snap.likes != null ? `${formatCompact(snap.likes)} likes` : null,
          snap.comments != null ? `${formatCompact(snap.comments)} comments` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
  const footerLong =
    idea.kind === "post" && snap?.saved_from
      ? `SAVED FROM ${snap.saved_from.toUpperCase()}`
      : `${ideaAuthor(idea)} · ${ideaAge(idea.created_at, now)}`;
  const footerShort =
    idea.kind === "post" && brand
      ? `FROM ${brand}`
      : `${ideaAuthor(idea)} · ${ideaAge(idea.created_at, now, true)}`;

  const label = text ? text.replace(/\s+/g, " ").slice(0, 80) : (formatLabel(idea.kind) ?? "idea");
  const stacked = size === "1x2" || size === "2x2"; // picture on top
  const showTags = size !== "1x1";
  const hasMeta =
    showTags && (!!idea.platform || idea.tags.length > 0 || (idea.kind === "post" && !!format));
  const header = idea.kind === "link" || idea.kind === "ai" || idea.kind === "post";
  const big = size === "2x2" && !picture;
  const lines =
    picture && stacked
      ? { mobile: 3, wide: 3 }
      : linesThatFit(size, {
          header,
          badge: !!idea.planned,
          tags: hasMeta,
          stats: !!stats && size !== "1x1",
          big,
        });

  const pictureNode = picture && (
    <Picture
      url={imageUrl}
      label={idea.kind === "post" ? (format ?? "POST").toUpperCase() : "SCREENSHOT"}
      className={size === "2x1" ? "h-full w-[45%] shrink-0" : "min-h-0 w-full flex-1 basis-0"}
    />
  );

  const body = (
    <div
      className={`flex min-w-0 flex-col gap-2 md:gap-2.5 ${
        picture && stacked ? "shrink-0" : "min-h-0 flex-1"
      }`}
    >
      {idea.planned && !(picture && stacked) && <PlannedBadge planned={idea.planned} />}

      {idea.kind === "link" && idea.link_url && (
        <a
          href={idea.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 -my-3 flex min-h-11 min-w-0 shrink-0 items-center gap-2 self-start text-muted hover:text-ink md:my-0 md:min-h-0"
        >
          <Link2 size={16} aria-hidden="true" className="shrink-0" />
          <span className="truncate font-mono text-small">{linkLabel(idea.link_url)}</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      {idea.kind === "post" && (
        <p className="hidden shrink-0 truncate mono-label text-muted md:block">
          FROM {brand ?? "A COMPETITOR"}
          {snap?.date && ` · ${(formatShortDate(snap.date) ?? "").toUpperCase()}`}
        </p>
      )}
      {idea.kind === "ai" && (
        <p className="flex shrink-0 items-center gap-1.5 mono-label text-muted">
          <AiTag />
          FROM ASK BLIP
        </p>
      )}
      {isNote && size === "2x2" && (
        <StickyNote size={18} aria-hidden="true" className="hidden shrink-0 md:block" />
      )}

      {text && (
        <p
          style={{ "--lines": lines.mobile, "--lines-md": lines.wide } as CSSProperties}
          className={`line-clamp-(--lines) font-medium break-words whitespace-pre-line md:line-clamp-(--lines-md) ${
            big
              ? "text-small md:text-heading"
              : size === "2x1" || picture
                ? "text-small md:text-body-sm"
                : "text-small md:text-body"
          }`}
        >
          {text}
        </p>
      )}
      {stats && size !== "1x1" && (
        <p className="hidden shrink-0 truncate text-small text-muted md:block">{stats}</p>
      )}

      {hasMeta && (
        <div className="hidden shrink-0 items-center gap-1.5 overflow-hidden md:flex">
          <PlatformIcon platform={idea.platform} />
          {idea.kind === "post" && format && <Chip>{format}</Chip>}
          {idea.tags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
      )}

      <div className="mt-auto flex shrink-0 items-center justify-between gap-2 md:border-t md:border-line md:pt-2">
        <p className="min-w-0 truncate mono-label text-muted">
          <span className="md:hidden">{footerShort}</span>
          <span className="hidden md:inline">{footerLong}</span>
        </p>
        {!idea.planned && (
          <button
            type="button"
            onClick={() => onOpen(true)}
            aria-label={`Plan it: ${label}`}
            className="relative z-10 hidden shrink-0 items-center gap-1 text-small font-medium text-blue hover:underline md:inline-flex"
          >
            <CalendarDays size={12} aria-hidden="true" />
            Plan it
          </button>
        )}
      </div>
    </div>
  );

  return (
    <article
      data-tile={size}
      className={`relative flex h-full overflow-hidden rounded-card p-3 md:p-3.5 ${
        size === "2x1" ? "flex-row gap-3 md:gap-3.5" : "flex-col gap-2 md:gap-2.5"
      } ${isNote ? "bg-bloom" : "border border-line bg-surface"}`}
    >
      {/* The whole tile opens the detail; links and Plan it sit above this button (z-10). */}
      <button
        type="button"
        onClick={() => onOpen(false)}
        aria-label={`Open idea: ${label}`}
        className="absolute inset-0 rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
      />
      {picture && stacked && idea.planned && (
        <div className="absolute top-5 left-5 z-10 md:top-5.5 md:left-5.5">
          <PlannedBadge planned={idea.planned} />
        </div>
      )}
      {pictureNode}
      {body}
    </article>
  );
}
