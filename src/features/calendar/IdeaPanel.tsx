import { Link } from "react-router";

/**
 * 08 idea board side panel. Ideas arrive in Slice 10; until then it shows how it'll be used.
 * Desktop: 280 px beside the grid. Tablet: under the grid. Phones: not shown (Ideas tab).
 */
export function IdeaPanel() {
  return (
    <aside
      aria-labelledby="idea-panel-title"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 xl:w-70 xl:shrink-0 xl:self-stretch"
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
      <div className="flex flex-col items-center gap-1.5 rounded-control border border-dashed border-line px-4 py-8 text-center">
        <p className="mono-label text-muted">No ideas yet</p>
        <p className="text-small text-muted">
          Ideas you save will show up here, ready to drag onto a day.
        </p>
      </div>
    </aside>
  );
}
