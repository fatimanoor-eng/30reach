import { Check } from "lucide-react";
import { BackButton } from "./BackButton";
import { useEffect, useRef, useState } from "react";
import { BlipScanning, BlipSuccess } from "../../../components/blip/BlipPoses";
import { Button } from "../../../components/Button";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { ModalPresence } from "../../../components/ModalPresence";
import { plural } from "../../../lib/format";
import { MQ_TABLET_UP, useMediaQuery } from "../../../lib/useMediaQuery";
import {
  checklistRows,
  reviewDefaults,
  type RowState,
  SCAN_UP_FRONT,
  scanStep,
} from "./add-client-rules";
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
              ? `Not enough Firecrawl credits for a scan (needs about 20; ${r.remaining} left). Add the client by hand instead.`
              : "Couldn’t read the website just now. Try again, or add the client by hand.",
          );
          return;
        }
        update((p) => ({ scan: r, credits: p.credits + r.credits }));
        s = { ...latest.current, scan: r };
      }
      // 2. Competitor suggestions (Discovery 2.0: ≈ 8–9 credits for a national brand, 6 local).
      if (!s.suggestions) {
        setSearching(true);
        const r = await once(`suggest:${s.website}`, () => suggestCompetitors(s.scanId, s.scan!));
        setSearching(false);
        if (halted()) return;
        const list = isFailure(r) ? [] : r.suggestions;
        const big = isFailure(r) ? [] : r.big;
        update((p) => ({
          suggestions: list,
          big,
          credits: p.credits + (isFailure(r) ? 0 : r.credits),
        }));
        s = { ...latest.current, suggestions: list, big };
      }
      // 3. The top closest rivals' home pages (1 credit each, accounts + logo), two at a time. The rest,
      //    and Big in your space, are read only if someone ticks them in Review.
      const todo = s
        .suggestions!.map((x, i) => [x, i] as const)
        .filter(([x], i) => i < SCAN_UP_FRONT && x.accounts === null && !x.unreadable);
      for (let k = 0; k < todo.length; k += 2) {
        const batch = todo.slice(k, k + 2);
        const results = await Promise.all(
          batch.map(([x]) =>
            once(`accounts:${x.website}`, () => readAccounts(s.scanId, x.website, x.name)),
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
                ? { ...next[i], accounts: r.accounts, logoPath: r.logoPath, logoUrl: r.logoUrl }
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
      update({
        step: "review",
        draft: reviewDefaults(done.scan!, done.suggestions ?? [], done.big ?? []),
      });
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
      bigCount: state.big?.length ?? 0,
    },
    { short: !tabletUp },
  );
  const host = state.website.replace(/^https?:\/\//, "");
  const step = scanStep({
    website: state.website,
    scan: state.scan,
    suggestions: state.suggestions,
    accountsRead: state.accountsRead,
    searching,
    finished,
  });

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
        <>
          {/* UI polish 26 Nov: where the scan is, in words. */}
          <p className="mt-6 w-full text-left mono-label text-muted" aria-live="polite">
            Step {step.n} of {step.of} · <span className="text-ink">{step.label}</span>
          </p>
          <ol
            aria-label="Scan progress"
            className="mt-2 w-full divide-y divide-line overflow-hidden rounded-card border border-line bg-surface text-left"
          >
            {rows.map((r) => (
              <li
                key={r.key}
                aria-current={r.state === "active" ? "step" : undefined}
                className={`flex min-h-11 items-center gap-3 px-4 py-2.5 md:min-h-10 ${r.state === "active" ? "bg-soft" : ""}`}
              >
                <RowDot state={r.state} />
                <span
                  className={`min-w-0 flex-1 truncate text-body-sm ${r.state === "active" ? "font-semibold text-ink" : r.state === "muted" || r.state === "next" ? "text-muted" : ""}`}
                >
                  {r.label}
                </span>
                {r.meta && (
                  <span
                    className={`shrink-0 font-mono text-label uppercase ${r.state === "active" ? "text-ink" : "text-muted"}`}
                  >
                    {r.meta}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </>
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
    // A turning ring (a pulsing Flash dot with reduced motion).
    return (
      <span aria-label="In progress" className="relative inline-flex size-5 shrink-0">
        <span className="absolute inset-0 rounded-full border-2 border-line-strong" />
        <span className="absolute inset-0 rounded-full border-2 border-ink border-t-transparent border-r-transparent motion-safe:animate-spin motion-reduce:animate-pulse motion-reduce:border-flash motion-reduce:bg-flash" />
      </span>
    );
  if (state === "muted")
    return <span aria-hidden="true" className="size-5 shrink-0 rounded-full bg-soft" />;
  return (
    <span aria-hidden="true" className="size-5 shrink-0 rounded-full border border-line-strong" />
  );
}
