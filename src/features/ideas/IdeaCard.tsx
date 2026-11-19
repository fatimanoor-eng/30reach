import { CalendarCheck, CalendarDays, Check, ImageIcon, Link2, StickyNote } from "lucide-react";
import { Link } from "react-router";
import { Chip } from "../../components/Chip";
import { InstagramIcon, TikTokIcon } from "../../components/icons/BrandIcons";
import { formatCompact, formatShortDate } from "../../lib/format";
import { AiTag } from "../calendar/CardTile";
import { todayIso } from "../calendar/events/dates";
import {
  formatLabel,
  aiSourceLabel,
  aiSuggestion,
  planOnLabel,
  hasPicture,
  ideaAge,
  ideaAuthor,
  ideaText,
  linkLabel,
  plannedLabel,
  type Idea,
  type IdeaPlatform,
} from "./idea-rules";
import { usePlanOnDay } from "./usePlanOnDay";

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

/**
 * The picture at its own aspect ratio, never cropped. With a stored size the box has that ratio
 * before the image loads (no jump); without one (saved before sizes were stored) the image sets
 * its own height when it loads.
 */
function Picture({
  url,
  label,
  width,
  height,
}: {
  url?: string;
  label: string;
  width: number | null;
  height: number | null;
}) {
  const ratio = width && height ? `${width} / ${height}` : undefined;
  return (
    <div
      style={{ aspectRatio: ratio ?? (url ? undefined : "4 / 5") }}
      className="w-full shrink-0 overflow-hidden rounded-control bg-soft"
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className={`block w-full ${ratio ? "h-full" : "h-auto"}`}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <ImageIcon size={20} aria-hidden="true" />
          <span className="hidden mono-label md:inline">{label}</span>
        </div>
      )}
    </div>
  );
}

/**
 * One idea as a bento tile (14b / M09). Its height is its content: the picture (if any) at its own
 * ratio, then the text, tags and footer; the grid gives it the rows it needs (BentoGrid). Text is
 * clamped: 3 lines under a picture, more for notes, links and AI ideas.
 * Notes are Bloom tiles without a border. Phones keep M09's shorter footer and no tags.
 */
export function IdeaCard({
  idea,
  imageUrl,
  now,
  onOpen,
  selection,
}: {
  idea: Idea;
  imageUrl?: string;
  /** "2 days ago" is worked out from this (the page time, so all tiles agree). */
  now: number;
  /** Open the 14c detail; `plan` = straight into Plan it (the tile's "Plan it" link). */
  onOpen: (plan: boolean) => void;
  /**
   * Select mode (delete many): the whole tile becomes a checkbox; links, Plan it and Plan on are
   * covered. `allowed` = this person may delete it (their own, or any for an admin).
   */
  selection?: { selected: boolean; allowed: boolean; onToggle: () => void };
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
  const hasMeta = !!idea.platform || idea.tags.length > 0 || (idea.kind === "post" && !!format);
  const suggestion = aiSuggestion(idea, todayIso(new Date(now)));
  const planOn = usePlanOnDay();

  return (
    <article
      data-kind={idea.kind}
      className={`relative flex flex-col gap-2 overflow-hidden rounded-card p-3 md:gap-2.5 md:p-3.5 ${
        isNote ? "bg-bloom" : "border border-line bg-surface"
      }`}
    >
      {/* The whole tile opens the detail; links and Plan it sit above this button (z-10). In
          select mode a checkbox covers everything (z-20). */}
      {selection ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selection.selected}
          aria-disabled={!selection.allowed || undefined}
          aria-label={
            selection.allowed
              ? `Select idea: ${label}`
              : `Can’t delete (only who added it or an admin): ${label}`
          }
          title={
            selection.allowed
              ? undefined
              : "Only the person who added it, or an admin, can delete it"
          }
          onClick={() => selection.allowed && selection.onToggle()}
          className={`absolute inset-0 z-20 rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${
            selection.selected ? "ring-2 ring-ink ring-inset" : ""
          } ${selection.allowed ? "cursor-pointer" : "cursor-not-allowed bg-surface/50"}`}
        >
          {selection.allowed && (
            <span
              aria-hidden="true"
              className={`absolute top-2.5 right-2.5 inline-flex size-5 items-center justify-center rounded-[5px] ${
                selection.selected ? "bg-ink text-white" : "border-[1.5px] border-ink bg-surface"
              }`}
            >
              {selection.selected && <Check size={13} strokeWidth={3} />}
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(false)}
          aria-label={`Open idea: ${label}`}
          className="absolute inset-0 rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
        />
      )}

      {idea.planned && <PlannedBadge planned={idea.planned} />}

      {idea.kind === "link" && idea.link_url && (
        <a
          href={idea.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 -my-3 flex min-h-11 min-w-0 items-center gap-2 self-start text-muted hover:text-ink md:my-0 md:min-h-0"
        >
          <Link2 size={16} aria-hidden="true" className="shrink-0" />
          <span className="truncate font-mono text-small">{linkLabel(idea.link_url)}</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      {idea.kind === "post" && (
        <p className="hidden truncate mono-label text-muted md:block">
          FROM {brand ?? "A COMPETITOR"}
          {snap?.date && ` · ${(formatShortDate(snap.date) ?? "").toUpperCase()}`}
        </p>
      )}
      {idea.kind === "ai" && (
        <p className="flex items-center gap-1.5 mono-label text-muted">
          <AiTag />
          {aiSourceLabel(snap)}
        </p>
      )}
      {isNote && <StickyNote size={18} aria-hidden="true" className="hidden md:block" />}

      {picture && (
        <Picture
          url={imageUrl}
          label={idea.kind === "post" ? (format ?? "POST").toUpperCase() : "SCREENSHOT"}
          width={idea.image_width}
          height={idea.image_height}
        />
      )}

      {text && (
        <p
          className={`font-medium break-words whitespace-pre-line ${
            picture
              ? "line-clamp-3 text-small md:text-body-sm"
              : "line-clamp-6 text-small md:line-clamp-8 md:text-body"
          }`}
        >
          {text}
        </p>
      )}
      {stats && <p className="hidden truncate text-small text-muted md:block">{stats}</p>}

      {hasMeta && (
        <div className="hidden flex-wrap items-center gap-1.5 md:flex">
          <PlatformIcon platform={idea.platform} />
          {idea.kind === "post" && format && <Chip>{format}</Chip>}
          {idea.tags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
      )}

      {suggestion && (
        <div className="flex flex-col items-start gap-0.5">
          <p className="mono-label text-muted">{suggestion.label}</p>
          {suggestion.day && (
            <button
              type="button"
              disabled={planOn.isPending}
              onClick={() => planOn.mutate({ idea, day: suggestion.day! })}
              className="relative z-10 -my-2.5 inline-flex min-h-11 items-center gap-1 text-small font-medium text-blue hover:underline disabled:opacity-60 md:my-0 md:min-h-0"
            >
              <CalendarCheck size={12} aria-hidden="true" />
              {planOn.isPending ? "Planning…" : planOnLabel(suggestion.day)}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 md:mt-0.5 md:border-t md:border-line md:pt-2">
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
    </article>
  );
}
