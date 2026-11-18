import { Plus, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "../../app/PageHeader";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { LoadError } from "../../components/LoadError";
import { ModalPresence } from "../../components/ModalPresence";
import { useToast } from "../../components/toast-context";
import { Bone, Skeleton } from "../../components/Skeleton";
import { AddIdeaSheet } from "./AddIdeaSheet";
import { CaptureBar } from "./CaptureBar";
import { useCapture } from "./capture-context";
import { DraftCard } from "./DraftCard";
import { BentoGrid, BentoItem } from "./BentoGrid";
import { IdeaCard } from "./IdeaCard";
import { IdeaDetail } from "./IdeaDetail";
import {
  filterIdeas,
  looksLikeUrl,
  normaliseUrl,
  tabCounts,
  TABS,
  tileColumns,
  type Idea,
  type IdeaTab,
} from "./idea-rules";
import { useIdeaImages, useIdeas } from "./ideas-api";

const isTab = (v: string | null): v is IdeaTab => TABS.some((t) => t.id === v);

/** Tabs by type with counts. Mono chips on tablet/desktop (14b), sans pills on phones (M09). */
function IdeaTabs({
  tab,
  counts,
  onChange,
}: {
  tab: IdeaTab;
  counts: Record<IdeaTab, number>;
  onChange: (tab: IdeaTab) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Show"
      className="-mx-4 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
    >
      {TABS.map((t) => {
        const on = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.id)}
            className="group inline-flex min-h-11 shrink-0 items-center md:min-h-7"
          >
            <span
              className={`inline-flex h-7 items-center rounded-full px-2.5 text-small font-medium whitespace-nowrap md:h-5.5 md:font-mono md:text-label md:font-normal ${
                on
                  ? "bg-ink text-white"
                  : "border border-line bg-surface text-ink group-hover:bg-soft md:border-0"
              }`}
            >
              {t.label} · {counts[t.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Loading tiles: [columns, rows of 8 px] — a landscape picture, portrait pictures, notes, links. */
const SKELETON_TILES: [1 | 2, number][] = [
  [1, 46],
  [2, 30],
  [1, 20],
  [1, 24],
  [1, 40],
  [1, 22],
  [2, 28],
  [1, 34],
];

function hasFiles(e: DragEvent) {
  return [...e.dataTransfer.types].includes("Files");
}

/**
 * Idea board (14a / 14b, M09): capture box, tabs + search, ideas as a bento grid (DESIGN_SYSTEM ›
 * Idea board). Drop images anywhere on the page. Drafts (unsaved captures) sit above the grid at
 * their natural height, in the same columns.
 * Tab in the URL (?tab=link); search is per visit.
 */
export function IdeasPage() {
  const ideas = useIdeas();
  const capture = useCapture();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab: IdeaTab = isTab(params.get("tab")) ? (params.get("tab") as IdeaTab) : "all";
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  // "2 days ago" is worked out once per visit (not on every render).
  const [now] = useState(Date.now);

  const all = useMemo(() => ideas.data ?? [], [ideas.data]);
  const counts = useMemo(() => tabCounts(all), [all]);
  const shown = useMemo(() => filterIdeas(all, tab, query), [all, tab, query]);

  // ── 14c detail: ?idea=<id> (&plan=1 opens Plan it straight away). The last open idea is kept so
  // the drawer can slide out after the URL changes.
  const openId = params.get("idea");
  const openIdea = openId ? (all.find((i) => i.id === openId) ?? null) : null;
  const [lastIdea, setLastIdea] = useState<Idea | null>(null);
  if (openIdea && openIdea !== lastIdea) setLastIdea(openIdea);
  const detailIdea = openIdea ?? lastIdea;
  const openDetail = (id: string, plan: boolean) =>
    setParams((p) => {
      p.set("idea", id);
      if (plan) p.set("plan", "1");
      else p.delete("plan");
      return p;
    });
  const closeDetail = useCallback(
    () =>
      setParams(
        (p) => {
          p.delete("idea");
          p.delete("plan");
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  // Just deleted here: the list can refresh before the URL drops ?idea=, which isn't "missing".
  const [deletedId, setDeletedId] = useState<string | null>(null);
  const missingIdea = !!openId && ideas.isSuccess && !openIdea && openId !== deletedId;
  useEffect(() => {
    if (!missingIdea) return;
    toast.show({ title: "That idea isn’t on the board any more", pose: "idle" });
    closeDetail();
  }, [missingIdea, toast, closeDetail]);

  const images = useIdeaImages([
    ...shown.flatMap((i) => (i.image_path ? [i.image_path] : [])),
    ...(detailIdea?.image_path ? [detailIdea.image_path] : []),
  ]);
  const imageFor = (idea: Idea) =>
    idea.image_path ? (images.data?.get(idea.image_path) ?? undefined) : undefined;

  const setTab = (next: IdeaTab) =>
    setParams(
      (p) => {
        if (next === "all") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );

  // Drop files (or a dragged link) anywhere on the page.
  const dropHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDragOver: (e: DragEvent) => {
      if (hasFiles(e) || [...e.dataTransfer.types].includes("text/uri-list")) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      dragDepth.current = 0;
      setDragging(false);
      const files = [...e.dataTransfer.files];
      if (files.length) {
        e.preventDefault();
        capture.addImages(files, "drop");
        return;
      }
      const link = e.dataTransfer.getData("text/uri-list").split("\n")[0]?.trim() ?? "";
      if (looksLikeUrl(link)) {
        e.preventDefault();
        capture.addLink(normaliseUrl(link) ?? link);
      }
    },
  };

  const drafts = capture.drafts.length > 0 && (
    <div className="grid grid-cols-2 items-start gap-2.5 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
      {capture.drafts.map((d) => (
        <DraftCard key={d.key} draft={d} autoFocus={d.key === capture.focusKey} />
      ))}
    </div>
  );

  let body: ReactNode;
  if (ideas.isError) {
    body = <LoadError title="Ideas didn’t load" onRetry={() => void ideas.refetch()} />;
  } else if (ideas.isPending) {
    // The board's shapes: a landscape picture (2 columns), portrait pictures, notes and links.
    body = (
      <Skeleton label="Loading ideas">
        <BentoGrid>
          {SKELETON_TILES.map(([columns, rows], i) => (
            <BentoItem key={i} columns={columns} rows={rows}>
              <Bone className="rounded-card" style={{ height: rows * 8 - 16 }} />
            </BentoItem>
          ))}
        </BentoGrid>
      </Skeleton>
    );
  } else if (!all.length && !capture.drafts.length) {
    body = (
      <EmptyState
        label="Idea board"
        title="Nothing saved yet"
        text="Paste a screenshot, add a link or write a note. Posts you save from Overview, Instagram and TikTok land here too."
        actions={
          <Button
            className="md:hidden"
            icon={<Plus size={16} />}
            onClick={() => setSheetOpen(true)}
          >
            Add an idea
          </Button>
        }
      />
    );
  } else {
    const tabLabel = TABS.find((t) => t.id === tab)!.label.toLowerCase();
    body = (
      <>
        {drafts}
        {shown.length > 0 && (
          <BentoGrid>
            {shown.map((idea) => (
              <BentoItem key={idea.id} columns={tileColumns(idea)}>
                <IdeaCard
                  idea={idea}
                  imageUrl={imageFor(idea)}
                  now={now}
                  onOpen={(plan) => openDetail(idea.id, plan)}
                />
              </BentoItem>
            ))}
          </BentoGrid>
        )}
        {!shown.length && (
          <p className="py-10 text-center text-body-sm text-muted">
            {query.trim()
              ? `No ideas match “${query.trim()}”.`
              : `No ${tab === "all" ? "ideas" : tabLabel} yet.`}
          </p>
        )}
      </>
    );
  }

  return (
    <div {...dropHandlers}>
      <PageHeader
        title="Idea board"
        mobileTitle="Ideas"
        description={
          <span className="hidden md:inline">
            Your swipe file. Save anything that could become a post later.
          </span>
        }
        actions={
          <>
            <label className="hidden h-10 w-56 items-center gap-2 rounded-control border border-line bg-surface px-3 focus-within:border-ink md:flex">
              <Search size={16} aria-hidden="true" className="shrink-0 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ideas"
                aria-label="Search ideas"
                className="min-w-0 flex-1 bg-transparent text-body-sm outline-none placeholder:text-muted"
              />
            </label>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label="Add an idea"
              className="inline-flex size-11 items-center justify-center rounded-full bg-ink text-white md:hidden"
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </>
        }
      />
      {/* The header keeps its usual margin; the rest is spaced like 14b (20 px). */}
      <div className="flex flex-col gap-4 md:gap-5">
        <div className="hidden md:block">
          <CaptureBar active={dragging || capture.drafts.length > 0} />
        </div>
        {!ideas.isError && !ideas.isPending && (all.length > 0 || capture.drafts.length > 0) && (
          <IdeaTabs tab={tab} counts={counts} onChange={setTab} />
        )}
        {body}
      </div>
      <AddIdeaSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <ModalPresence open={!!openIdea}>
        {detailIdea && (
          <IdeaDetail
            key={detailIdea.id}
            idea={detailIdea}
            imageUrl={imageFor(detailIdea)}
            onClose={closeDetail}
            onDeleted={(id) => {
              setDeletedId(id);
              closeDetail();
            }}
            planOnOpen={params.get("plan") === "1"}
          />
        )}
      </ModalPresence>
    </div>
  );
}
