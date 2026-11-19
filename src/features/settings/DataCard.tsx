import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/toast-context";
import { Tooltip } from "../../components/Tooltip";
import { useClient } from "../../lib/useClient";
import { useCompetitors } from "../../lib/useCompetitors";
import { eventsInRange } from "../calendar/events";
import { todayIso } from "../calendar/events/dates";
import { useHolidays } from "../calendar/useHolidays";
import { useSavedPulls } from "../overview/useOverviewData";
import { csvFileName, downloadCsv } from "./csv";
import {
  ClearPullError,
  fetchCardsForExport,
  fetchIdeasForExport,
  fetchLatestPullPosts,
  useClearPull,
} from "./settings-api";
import {
  cardsCsv,
  eventsCsv,
  eventsWindow,
  EXPORTS,
  ideasCsv,
  postsCsv,
  type ExportKind,
} from "./settings-export";

/**
 * 13 Data: Export (a small menu, one CSV per option, built in the browser) and Clear saved pull
 * (admins; the shared confirm → the admin-only `clear-pull` Edge Function deletes both saved pulls).
 */
export function DataCard({ isAdmin }: { isAdmin: boolean }) {
  const client = useClient();
  const pulls = useSavedPulls();
  const clear = useClearPull(client.data?.id);
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasPull = !!pulls.data?.latest;
  const clearBlocked = !isAdmin
    ? "Only admins can clear the saved pull"
    : pulls.isSuccess && !hasPull
      ? "There’s no saved pull to clear"
      : null;

  return (
    <Card title="Data">
      <div className="flex flex-col">
        <Row
          title="Export everything"
          text="Posts, ideas, calendar cards and calendar events as CSV, one file each."
          action={<ExportMenu />}
        />
        <Row
          title="Clear saved pull"
          text="Removes both saved pulls. The next Refresh starts fresh."
          action={
            <Tooltip content={clearBlocked ?? ""} enabled={!!clearBlocked}>
              {(tip) => (
                <Button
                  variant="secondary"
                  aria-disabled={!!clearBlocked || undefined}
                  aria-describedby={clearBlocked ? tip["aria-describedby"] : undefined}
                  onClick={(e) => {
                    if (clearBlocked) return tip.onToggle(e);
                    clear.reset();
                    setConfirmOpen(true);
                  }}
                  className={clearBlocked ? "cursor-not-allowed text-muted" : ""}
                >
                  Clear
                </Button>
              )}
            </Tooltip>
          }
        />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !clear.isPending && setConfirmOpen(false)}
        title="Clear saved pull?"
        description="Both saved pulls and their thumbnails are deleted for the whole team. Ideas saved from posts keep their own copy. The next Refresh starts fresh."
        confirmLabel={clear.isPending ? "Clearing…" : "Clear pull"}
        busy={clear.isPending}
        onConfirm={() =>
          clear.mutate(undefined, {
            onSuccess: () => {
              setConfirmOpen(false);
              toast.show({
                title: "Cleared the saved pull",
                detail: "Press Refresh on the Overview for a new one.",
                pose: "success",
              });
            },
          })
        }
      >
        {clear.isError && (
          <p role="alert" className="text-center text-small text-spark-text">
            {clear.error instanceof ClearPullError && clear.error.reason === "running"
              ? "A Refresh is running. Try again when it’s done."
              : clear.error instanceof ClearPullError && clear.error.reason === "not_admin"
                ? "Only admins can clear the saved pull."
                : "Couldn’t clear it. Check your connection and try again."}
          </p>
        )}
      </ConfirmDialog>
    </Card>
  );
}

function Row({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-t border-line py-3 last:pb-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body-sm font-medium">{title}</p>
        <p className="text-small text-muted">{text}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/** "Export ▾" → Posts (latest pull) · Ideas · Calendar cards · Calendar events. One CSV each. */
function ExportMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        wrap.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls="export-menu"
        onClick={() => setOpen((o) => !o)}
      >
        Export
        <ChevronDown size={14} aria-hidden="true" />
      </Button>
      {open && <ExportList onDone={() => setOpen(false)} />}
    </div>
  );
}

function ExportList({ onDone }: { onDone: () => void }) {
  const client = useClient();
  const competitors = useCompetitors();
  const toast = useToast();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  // Phones: bring the whole menu into view above the bottom tabs and the Blip button (scroll-mb).
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.scrollIntoView({ block: "nearest" });
  }, []);
  const today = todayIso();
  const win = eventsWindow(today);
  // Holidays load when the menu opens (code rules + Nager; never AI). Without Nager: export the rest.
  const holidays = useHolidays(win.years);
  const holidaysReady = win.years.every(
    (y) => holidays.byYear.has(y) || holidays.failedYears.includes(y),
  );

  async function run(kind: ExportKind) {
    const c = client.data;
    if (!c || busy) return;
    setBusy(kind);
    const file = (what: string) => csvFileName(c.name, what, today);
    try {
      if (kind === "posts") {
        const latest = await fetchLatestPullPosts(c.id);
        if (!latest) {
          toast.show({
            title: "No saved pull yet",
            detail: "Press Refresh on the Overview first.",
            pose: "idle",
          });
          return;
        }
        downloadCsv(
          file("posts"),
          postsCsv(latest.posts, competitors.data ?? [], latest.startedAt),
        );
      } else if (kind === "ideas") {
        downloadCsv(file("ideas"), ideasCsv(await fetchIdeasForExport(c.id)));
      } else if (kind === "cards") {
        downloadCsv(file("calendar-cards"), cardsCsv(await fetchCardsForExport(c.id)));
      } else {
        downloadCsv(
          file("calendar-events"),
          eventsCsv(eventsInRange(win.from, win.to, holidays.byYear)),
        );
      }
      onDone();
    } catch {
      toast.show({
        title: "Couldn’t export that",
        detail: "Check your connection and try again.",
        pose: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul
      ref={listRef}
      id="export-menu"
      aria-label="Export as CSV"
      className="absolute top-full right-0 z-20 mt-1 flex w-72 max-w-[calc(100vw-2rem)] scroll-mb-40 flex-col gap-0.5 rounded-[10px] border border-line bg-surface p-1.5 shadow-lg md:scroll-mb-4"
    >
      {EXPORTS.map((e) => {
        const waiting = e.kind === "events" && !holidaysReady;
        return (
          <li key={e.kind}>
            <button
              type="button"
              disabled={!!busy || waiting}
              onClick={() => void run(e.kind)}
              className="flex min-h-11 w-full items-start gap-2.5 rounded-[6px] px-2.5 py-2 text-left hover:bg-bg disabled:opacity-60"
            >
              <Download size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="text-small font-medium">
                  {busy === e.kind ? "Exporting…" : e.label}
                </span>
                <span className="text-label text-muted">
                  {waiting ? "Loading holidays…" : e.detail}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
