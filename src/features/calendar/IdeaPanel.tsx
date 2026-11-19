import { useDraggable } from "@dnd-kit/core";
import { CalendarCheck, Plus } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router";
import { InstagramIcon, TikTokIcon } from "../../components/icons/BrandIcons";
import { formatShortDate } from "../../lib/format";
import { aiSuggestion, ideaAuthor, ideaText, planOnLabel, type Idea } from "../ideas/idea-rules";
import { usePlanOnDay } from "../ideas/usePlanOnDay";
import { todayIso } from "./events/dates";

/** "FROM HERS · 12 NOV", "BLIP" (AI ideas) or the author's first name (08 idea panel). */
function source(idea: Idea): string {
  const snap = idea.source_snapshot;
  if (idea.kind === "post" && snap?.brand)
    return [`FROM ${snap.brand}`, formatShortDate(snap.date)].filter(Boolean).join(" · ");
  return ideaAuthor(idea);
}

/** One idea in the panel (and the drag preview): Bloom card, source + platform icon, text. */
export const IdeaPanelItem = forwardRef<
  HTMLButtonElement,
  { idea: Idea; dragging?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>
>(function IdeaPanelItem({ idea, dragging = false, className = "", ...props }, ref) {
  const Icon =
    idea.platform === "instagram" ? InstagramIcon : idea.platform === "tiktok" ? TikTokIcon : null;
  const text = ideaText(idea) || idea.link_url || "Idea";
  const suggestion = aiSuggestion(idea, todayIso());
  return (
    <button
      ref={ref}
      type="button"
      className={`flex w-full touch-none flex-col gap-2 rounded-control bg-bloom p-3 text-left ${
        dragging ? "cursor-grabbing shadow-lg" : "cursor-grab hover:brightness-[0.98]"
      } ${className}`}
      {...props}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="truncate mono-label text-muted">{source(idea)}</span>
        {Icon && <Icon size={14} aria-hidden="true" className="shrink-0" />}
      </span>
      <span className="line-clamp-3 text-small font-medium">{text}</span>
      {suggestion && <span className="mono-label text-muted">{suggestion.label}</span>}
    </button>
  );
});

function DraggableIdea({ idea }: { idea: Idea }) {
  const navigate = useNavigate();
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `idea:${idea.id}` });
  const day = aiSuggestion(idea, todayIso())?.day ?? null;
  const planOn = usePlanOnDay();
  return (
    <li className="flex flex-col gap-1">
      <IdeaPanelItem
        ref={setNodeRef}
        idea={idea}
        {...attributes}
        {...listeners}
        // No mouse: open it on the board with Plan it (keyboards and screen readers plan from there).
        onClick={() => navigate(`/ideas?idea=${idea.id}&plan=1`)}
        aria-roledescription="idea"
        aria-label={`${ideaText(idea).slice(0, 80) || "Idea"}. Drag onto a day, or open to plan it.`}
        className={isDragging ? "opacity-40" : ""}
      />
      {/* Beside the draggable card, not inside it (a button can't hold a button). */}
      {day && (
        <button
          type="button"
          disabled={planOn.isPending}
          onClick={() => planOn.mutate({ idea, day })}
          className="inline-flex min-h-11 items-center gap-1 self-start px-1 text-small font-medium text-blue hover:underline disabled:opacity-60 md:min-h-6"
        >
          <CalendarCheck size={12} aria-hidden="true" />
          {planOn.isPending ? "Planning…" : planOnLabel(day)}
        </button>
      )}
    </li>
  );
}

/**
 * 08 idea board side panel: ideas not on the calendar yet, newest first. Drag one onto a day to plan
 * it (CalendarDnd); a click opens it on the board with Plan it. Desktop: 280 px beside the grid
 * (the list scrolls). Tablet: under the grid. Phones: not shown (Ideas tab).
 */
export function IdeaPanel({
  ideas,
  loading,
  error,
  onRetry,
}: {
  ideas: Idea[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const unplanned = ideas.filter((i) => !i.planned_card_id);
  return (
    <aside
      aria-labelledby="idea-panel-title"
      className="flex min-h-0 flex-col gap-3 rounded-card border border-line bg-surface p-4 xl:w-70 xl:shrink-0 xl:self-stretch"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="idea-panel-title" className="text-card">
          Idea board
        </h2>
        <Link
          to="/ideas"
          className="inline-flex min-h-11 items-center text-small text-blue hover:underline md:min-h-6"
        >
          Open full board »
        </Link>
      </div>
      <p className="text-small text-muted">Drag an idea onto a day to schedule it.</p>

      {error ? (
        <p className="text-small text-muted">
          Ideas didn’t load.{" "}
          <button type="button" onClick={onRetry} className="text-blue hover:underline">
            Try again
          </button>
        </p>
      ) : loading ? (
        <div
          aria-busy="true"
          aria-label="Loading ideas"
          className="skeleton-delay flex flex-col gap-3"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-control bg-soft motion-safe:animate-pulse" />
          ))}
        </div>
      ) : unplanned.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-control border border-dashed border-line px-4 py-8 text-center">
          <p className="mono-label text-muted">No ideas to plan</p>
          <p className="text-small text-muted">
            Ideas you save will show up here, ready to drag onto a day.
          </p>
        </div>
      ) : (
        <ul className="-mx-1 flex min-h-0 flex-col gap-3 overflow-y-auto px-1 md:grid md:grid-cols-2 xl:flex xl:max-h-[calc(100dvh-20rem)]">
          {unplanned.map((idea) => (
            <DraggableIdea key={idea.id} idea={idea} />
          ))}
        </ul>
      )}

      <Link
        to="/ideas"
        className="flex min-h-11 items-center gap-2 rounded-control border border-dashed border-line px-3 text-small font-medium text-muted hover:border-ink hover:text-ink md:min-h-10"
      >
        <Plus size={14} aria-hidden="true" />
        Add idea
      </Link>
    </aside>
  );
}
