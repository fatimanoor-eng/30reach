import { Check } from "lucide-react";
import { BackButton } from "./BackButton";
import { useEffect, useRef, useState } from "react";
import { BlipScanning, BlipSuccess } from "../../../components/blip/BlipPoses";
import { Button } from "../../../components/Button";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { ModalPresence } from "../../../components/ModalPresence";
import { plural } from "../../../lib/format";
import { MQ_TABLET_UP, useMediaQuery } from "../../../lib/useMediaQuery";
import { checklistRows, reviewDefaults, type RowState } from "./add-client-rules";
import {
  isFailure,
  readAccounts,
  type ScanFailure,
  scanSite,
  suggestCompetitors,
} from "./add-client-api";
import type { FlowState } from "./add-client-state";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls already on their way, by step + site. A paid call is never sent twice for the same thing: when
 * the effect runs again (React StrictMode in development, a quick remount) it waits for the same answer.
 */
const inflight = new Map<string, Promise<unknown>>();

/** One call, retried once after a rate limit (waits what Firecrawl asks, at most a minute). Shared by key. */
function once<T>(key: string, call: () => Promise<T | ScanFailure>): Promise<T | ScanFailure> {
  const running = inflight.get(key) as Promise<T | ScanFailure> | undefined;
  if (running) return running;
  const p = (async () => {
    const first = await call();
    if (isFailure(first) && first.kind === "rate_limited") {
      await wait(Math.min(60, first.retryAfter) * 1000);
      return call();
    }
    return first;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * 15c / M15 Scanning: the live checklist while scan-site (client page), suggest-competitors (2 searches
 * [+ 1 listicle]) and scan-site (each suggestion's home page) run, step by step from this tab. Each step's
 * result is saved (sessionStorage), so a reload or a locked phone carries on without paying twice.
 * Cancel stops after the current step ("Cancel? 7 credits were used; nothing is saved.").
 */
export function ScanningStep({
  state,
  update,
  onUnreadable,
  onCancelled,
  onManual,
  onBack,
}: {
  state: FlowState;
  update: (patch: Partial<FlowState> | ((s: FlowState) => Partial<FlowState>)) => void;
  onUnreadable: (u: NonNullable<FlowState["unreadable"]>) => void;
  onCancelled: () => void;
  onManual: () => void;
  /** "← Back" to the website step (the scan's paid steps are kept). */
  onBack?: () => void;
}) {
  const tabletUp = useMediaQuery(MQ_TABLET_UP);
  const [searching, setSearching] = useState(false);
  const [finished, setFinished] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelled = useRef(false);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    let stop = false;
    const halted = () => stop || cancelled.current;
    async function run() {
      let s = latest.current;
      // 1. The client's own site (1 credit) + profile.
      if (!s.scan) {
        const r = await once(`scan:${s.website}`, () => scanSite(s.website, s.scanId));
        if (halted()) return;
        if (isFailure(r)) {
          if (r.kind === "unreadable")
            return onUnreadable({ reason: r.reason, credits: r.credits });
          setProblem(
            r.kind === "low_credits"
              ? `Not enough Firecrawl credits for a scan (needs about 12; ${r.remaining} left). Add the client by hand instead.`
              : "Couldn’t read the website just now. Try again, or add the client by hand.",
          );
          return;
        }
        update((p) => ({ scan: r, credits: p.credits + r.credits }));
        s = { ...latest.current, scan: r };
      }
      // 2. Competitor suggestions (≈ 4–5 credits).
      if (!s.suggestions) {
        setSearching(true);
        const r = await once(`suggest:${s.website}`, () => suggestCompetitors(s.scanId, s.scan!));
        setSearching(false);
        if (halted()) return;
        const list = isFailure(r) ? [] : r.suggestions;
        update((p) => ({ suggestions: list, credits: p.credits + (isFailure(r) ? 0 : r.credits) }));
        s = { ...latest.current, suggestions: list };
      }
      // 3. Each suggestion's home page (1 credit each), two at a time.
      const todo = s
        .suggestions!.map((x, i) => [x, i] as const)
        .filter(([x]) => x.accounts === null && !x.unreadable);
      for (let k = 0; k < todo.length; k += 2) {
        const batch = todo.slice(k, k + 2);
        const results = await Promise.all(
          batch.map(([x]) =>
            once(`accounts:${x.website}`, () => readAccounts(s.scanId, x.website)),
          ),
        );
        if (halted()) return;
        update((p) => {
          const next = [...(p.suggestions ?? [])];
          let spent = 0;
          batch.forEach(([, i], j) => {
            const r = results[j];
            if (isFailure(r)) next[i] = { ...next[i], accounts: [], unreadable: true };
            else {
              spent += r.credits;
              next[i] = r.accounts
                ? { ...next[i], accounts: r.accounts }
                : { ...next[i], accounts: [], unreadable: true };
            }
          });
          return {
            suggestions: next,
            accountsRead: p.accountsRead + batch.length,
            credits: p.credits + spent,
          };
        });
      }
      if (halted()) return;
      // Blip/Success for a beat, then Review opens by itself.
      setFinished(true);
      await wait(900);
      if (halted()) return;
      const done = latest.current;
      update({ step: "review", draft: reviewDefaults(done.scan!, done.suggestions ?? []) });
    }
    void run();
    return () => {
      stop = true;
    };
    // Runs once per mount; progress is read from `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = checklistRows(
    {
      website: state.website,
      scan: state.scan,
      suggestions: state.suggestions,
      accountsRead: Math.min(state.accountsRead, state.suggestions?.length ?? 0),
      searching,
    },
    { short: !tabletUp },
  );
  const host = state.website.replace(/^https?:\/\//, "");

  return (
    <div className="mx-auto flex max-w-110 flex-col items-center px-4 py-6 text-center md:max-w-110 md:py-12">
      {finished ? (
        <BlipSuccess className="h-auto w-24 md:w-28" />
      ) : (
        <BlipScanning className="h-auto w-24 md:w-28" />
      )}
      <h1 className="mt-4 text-title md:mt-6">Reading {host}…</h1>
      {tabletUp && (
        <p className="mt-3 text-body-sm text-muted">
          This usually takes under a minute. You can keep this tab open; nothing is saved yet.
        </p>
      )}

      {problem ? (
        <div
          role="alert"
          className="mt-6 w-full rounded-card border border-line bg-surface p-5 text-left"
        >
          <p className="text-body-sm">{problem}</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onManual}>
              Add by hand
            </Button>
            <Button onClick={onCancelled}>Try again</Button>
          </div>
        </div>
      ) : (
        <ol
          aria-label="Scan progress"
          aria-live="polite"
          className="mt-6 w-full divide-y divide-line overflow-hidden rounded-card border border-line bg-surface text-left"
        >
          {rows.map((r) => (
            <li key={r.key} className="flex min-h-11 items-center gap-3 px-4 py-2.5 md:min-h-10">
              <RowDot state={r.state} />
              <span
                className={`min-w-0 flex-1 truncate text-body-sm ${r.state === "muted" || r.state === "next" ? "text-muted" : ""}`}
              >
                {r.label}
              </span>
              {r.meta && (
                <span className="shrink-0 font-mono text-label text-muted uppercase">{r.meta}</span>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5 flex w-full items-center justify-between gap-4">
        {onBack ? <BackButton onClick={onBack} /> : <span />}
        <div className="flex items-center gap-4">
          <p className="mono-label text-muted">{plural(state.credits, "credit")} used so far</p>
          {!problem && !finished && (
            <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <ModalPresence open={confirmCancel}>
        <ConfirmDialog
          open={confirmCancel}
          onClose={() => setConfirmCancel(false)}
          title="Cancel?"
          description={`${plural(state.credits, "credit")} ${state.credits === 1 ? "was" : "were"} used; nothing is saved.`}
          confirmLabel="Cancel scan"
          cancelLabel="Keep scanning"
          onConfirm={() => {
            cancelled.current = true;
            setConfirmCancel(false);
            onCancelled();
          }}
        />
      </ModalPresence>
    </div>
  );
}

function RowDot({ state }: { state: RowState }) {
  if (state === "done")
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-fresh text-white">
        <Check size={12} strokeWidth={3} aria-label="Done" />
      </span>
    );
  if (state === "active")
    return (
      <span
        aria-label="In progress"
        className="size-5 shrink-0 rounded-full bg-flash motion-safe:animate-pulse"
      />
    );
  if (state === "muted")
    return <span aria-hidden="true" className="size-5 shrink-0 rounded-full bg-soft" />;
  return (
    <span aria-hidden="true" className="size-5 shrink-0 rounded-full border border-line-strong" />
  );
}
