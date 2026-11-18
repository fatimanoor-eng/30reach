import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { formatCompact, formatShortDate } from "../../lib/format";
import { ideaAge, ideaAuthor, ideaText, type Idea } from "./idea-rules";
import { useIdea, useIdeaImages } from "./ideas-api";

/** The two lines under "INSPIRED BY": what it was, then numbers / who and when. */
function describe(idea: Idea): { title: string; meta: string } {
  const snap = idea.source_snapshot;
  if (idea.kind === "post" && snap) {
    const caption = snap.caption?.trim();
    return {
      title: [snap.brand, caption ? `“${caption}”` : null].filter(Boolean).join(" · "),
      meta: [
        snap.likes != null ? `${formatCompact(snap.likes)} likes` : null,
        formatShortDate(snap.date),
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const who = ideaAuthor(idea);
  return {
    title: ideaText(idea) || idea.link_url || "Idea",
    meta: `${who.charAt(0)}${who.slice(1).toLowerCase()} · ${ideaAge(idea.created_at).toLowerCase()}`,
  };
}

/**
 * 09 "Inspired by": the idea a card was planned from (soft row: thumbnail, INSPIRED BY, what it was,
 * numbers or who/when, arrow). Opens the idea on the board. Nothing when the card has no idea, or
 * the idea was deleted since.
 */
export function InspiredBy({ ideaId }: { ideaId: string | null }) {
  const idea = useIdea(ideaId);
  const path = idea.data?.image_path ?? null;
  const images = useIdeaImages(path ? [path] : []);
  if (!ideaId || !idea.data) return null;
  const { title, meta } = describe(idea.data);
  const thumb = path ? images.data?.get(path) : undefined;
  return (
    <Link
      to={`/ideas?idea=${idea.data.id}`}
      className="flex items-center gap-3 rounded-tile bg-bg p-3 hover:bg-soft"
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="h-12.5 w-10 shrink-0 rounded-[6px] bg-soft object-cover"
        />
      ) : (
        <span aria-hidden="true" className="h-12.5 w-10 shrink-0 rounded-[6px] bg-bloom" />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="mono-label text-muted">Inspired by</span>
        <span className="line-clamp-2 text-small font-medium">{title}</span>
        {meta && <span className="text-small text-muted">{meta}</span>}
      </span>
      <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
    </Link>
  );
}
