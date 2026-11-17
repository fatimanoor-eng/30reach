import { creditsSummary, formatResetDate, formatTime, type CreditsState } from "../lib/useCredits";

/**
 * Firecrawl credits meter (sidebar, More page). Live from the `credits` Edge Function.
 * Bar = credits LEFT as a share of the plan, in B30 Flash.
 * States: ready · loading ("— left", "Checking credits…") · error ("Couldn't load credits · Retry").
 * Stale (Firecrawl unreachable, cached reading): "live" becomes "as of 14:02".
 */
export function CreditsMeter({
  state,
  variant = "sidebar",
}: {
  state: CreditsState;
  variant?: "sidebar" | "card";
}) {
  const card = variant === "card";
  const ready = state.status === "ready" ? state.credits : null;
  const pct = ready ? Math.max(0, Math.min(100, (ready.remaining / ready.plan) * 100)) : 0;
  const reset = ready ? formatResetDate(ready.resetsAt) : null;

  return (
    <div
      className={card ? "on-dark rounded-card bg-ink p-4 text-white" : "text-white"}
      aria-busy={state.status === "loading" || undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono-label text-sidebar-text">Firecrawl credits</span>
        <span className="mono-label">
          {ready ? ready.remaining.toLocaleString("en-US") : "—"} left
        </span>
      </div>

      <div
        role="meter"
        aria-label="Firecrawl credits left"
        aria-valuemin={0}
        aria-valuemax={ready?.plan ?? 0}
        aria-valuenow={ready?.remaining ?? 0}
        aria-valuetext={creditsSummary(state)}
        className={`mt-2 h-1 overflow-hidden rounded-full ${card ? "bg-sidebar-2" : "bg-sidebar-line"}`}
      >
        <div
          className="h-full rounded-full bg-flash transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className={`mt-2 text-sidebar-text ${card ? "text-small" : "text-label"}`}>
        {state.status === "ready" && ready && (
          <p>
            of {ready.plan.toLocaleString("en-US")} ·{" "}
            {ready.stale ? `as of ${formatTime(ready.updatedAt)}` : "live"}
            {reset ? ` · resets ${reset}` : ""}
          </p>
        )}
        {state.status === "loading" && <p>Checking credits…</p>}
        {state.status === "error" && (
          <p className="flex items-center gap-1">
            <span role="alert">Couldn’t load credits</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={state.retry}
              className="-my-3 min-h-11 min-w-11 px-1 text-white underline-offset-2 hover:underline md:-my-1 md:min-h-6 md:min-w-0"
            >
              Retry
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
