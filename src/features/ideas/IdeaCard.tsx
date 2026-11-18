import { ImageIcon, Link2, StickyNote } from "lucide-react";
import { Link } from "react-router";
import { Chip } from "../../components/Chip";
import { InstagramIcon, TikTokIcon } from "../../components/icons/BrandIcons";
import { formatCompact, formatShortDate } from "../../lib/format";
import { AiTag } from "../calendar/CardTile";
import {
  formatLabel,
  ideaAge,
  ideaAuthor,
  ideaText,
  linkLabel,
  plannedLabel,
  type Idea,
  type IdeaPlatform,
} from "./idea-rules";

function PlatformIcon({ platform }: { platform: IdeaPlatform | null }) {
  if (platform === "instagram")
    return <InstagramIcon size={14} aria-label="Instagram" role="img" aria-hidden={false} />;
  if (platform === "tiktok")
    return <TikTokIcon size={14} aria-label="TikTok" role="img" aria-hidden={false} />;
  return null;
}

/** "Planned · Tue 5 Jan" (14b) / "Planned · 5 Jan" (M09). Opens that calendar card. */
function PlannedBadge({ planned }: { planned: NonNullable<Idea["planned"]> }) {
  return (
    <Link
      to={`/calendar?date=${planned.date}&card=${planned.id}`}
      className="-my-3 inline-flex min-h-11 items-center self-start md:my-0 md:min-h-0"
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

/** Picture: the stored image, or a soft block with a label while it loads / when there's none. */
function Picture({ url, label, alt }: { url?: string; label: string; alt: string }) {
  if (url)
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="max-h-56 w-full rounded-control bg-soft object-cover object-top md:max-h-80"
      />
    );
  return (
    <div className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-control bg-soft md:h-36">
      <ImageIcon size={20} aria-hidden="true" />
      <span className="hidden mono-label md:inline">{label}</span>
    </div>
  );
}

/**
 * One idea on the board. Desktop/tablet = 14b (tags, platform, footer line); phones = M09 (picture,
 * text, "FATIMA · 2D"). Notes are Bloom cards without a border.
 */
export function IdeaCard({
  idea,
  imageUrl,
  now,
}: {
  idea: Idea;
  imageUrl?: string;
  /** "2 days ago" is worked out from this (the page time, so all cards agree). */
  now: number;
}) {
  const text = ideaText(idea);
  const snap = idea.source_snapshot;
  const isNote = idea.kind === "note";
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
  const hasMeta = !!idea.platform || idea.tags.length > 0 || (idea.kind === "post" && !!format);

  return (
    <article
      className={`flex flex-col gap-2 rounded-card px-2.5 py-3 md:gap-2.5 md:p-3.5 ${
        isNote ? "bg-bloom" : "border border-line bg-surface"
      }`}
    >
      {idea.planned && <PlannedBadge planned={idea.planned} />}

      {/* Header line by kind (tablet/desktop; phones keep M09's simpler card). */}
      {idea.kind === "link" && idea.link_url && (
        <a
          href={idea.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="-my-3 flex min-h-11 min-w-0 items-center gap-2 text-muted hover:text-ink md:my-0 md:min-h-0"
        >
          <Link2 size={16} aria-hidden="true" className="shrink-0" />
          <span className="truncate font-mono text-small">{linkLabel(idea.link_url)}</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      {idea.kind === "post" && (
        <p className="hidden mono-label text-muted md:block">
          FROM {brand ?? "A COMPETITOR"}
          {snap?.date && ` · ${(formatShortDate(snap.date) ?? "").toUpperCase()}`}
        </p>
      )}
      {idea.kind === "ai" && (
        <p className="flex items-center gap-1.5 mono-label text-muted">
          <AiTag />
          FROM ASK BLIP
        </p>
      )}
      {isNote && <StickyNote size={18} aria-hidden="true" className="hidden md:block" />}

      {(idea.kind === "screenshot" || idea.kind === "post") && (
        <Picture
          url={imageUrl}
          label={idea.kind === "post" ? (format ?? "POST").toUpperCase() : "SCREENSHOT"}
          alt={
            text
              ? ""
              : idea.kind === "post"
                ? `Post from ${snap?.brand ?? "a competitor"}`
                : "Screenshot"
          }
        />
      )}

      {text && (
        <p
          className={`text-small font-medium break-words whitespace-pre-line md:text-body-sm ${
            isNote || idea.kind === "link" || idea.kind === "ai" ? "md:text-body" : ""
          } line-clamp-6`}
        >
          {text}
        </p>
      )}
      {stats && <p className="hidden text-small text-muted md:block">{stats}</p>}

      {hasMeta && (
        <div className="hidden flex-wrap items-center gap-1.5 md:flex">
          <PlatformIcon platform={idea.platform} />
          {idea.kind === "post" && format && <Chip>{format}</Chip>}
          {idea.tags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
      )}

      <p className="mono-label text-muted md:mt-0.5 md:border-t md:border-line md:pt-2">
        <span className="md:hidden">{footerShort}</span>
        <span className="hidden md:inline">{footerLong}</span>
      </p>
    </article>
  );
}
