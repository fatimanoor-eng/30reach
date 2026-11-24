import { RefreshCw } from "lucide-react";
import { Button } from "../../components/Button";
import { useClient } from "../../lib/useClient";
import { percentOf, usePull } from "./pull-context";

const RING = 2 * Math.PI * 20; // circumference for r = 20 in a 44 × 44 box

/**
 * Refresh (04 header). Tablet/desktop: "Refresh" → "Pulling… 58%" with a yellow bar along the bottom
 * (05c) → "Resume pull · 58%". Mobile (M02): round button with a progress ring (M04 annotation).
 * Click while pulling reopens the 05b card.
 */
export function RefreshButton() {
  const pull = usePull();
  const { state } = pull;
  const pct = percentOf(state);
  const active = state.kind === "running" || state.kind === "interrupted";
  const label =
    state.kind === "running"
      ? `Pulling… ${pct}%`
      : state.kind === "interrupted"
        ? `Resume pull · ${pct}%`
        : state.kind === "starting"
          ? "Starting…"
          : "Refresh";
  // The Demo client's data is made up: pulls are off (Slice 17f).
  const demo = useClient().data?.is_demo === true;
  const disabled = !pull.clientId || state.kind === "starting" || demo;
  const why = demo ? "Demo client · pulls are off" : undefined;
  const spin = state.kind === "running" || state.kind === "starting";
  const icon = (size: number) => (
    <RefreshCw size={size} aria-hidden="true" className={spin ? "motion-safe:animate-spin" : ""} />
  );

  return (
    <>
      {/* Wrapper does the hiding: Button always sets inline-flex, which would beat `hidden`. */}
      <span className="hidden md:inline-flex">
        <Button
          onClick={pull.onRefreshClick}
          disabled={disabled}
          icon={icon(16)}
          title={why}
          aria-description={why}
          className="relative overflow-hidden"
        >
          {label}
          {active && (
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.75 bg-sidebar-2">
              <span
                className="block h-full bg-flash transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </span>
          )}
        </Button>
      </span>

      <button
        type="button"
        onClick={pull.onRefreshClick}
        disabled={disabled}
        aria-label={why ? `${label} (${why})` : label}
        title={why}
        className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-40 md:hidden"
      >
        {icon(20)}
        {active && (
          <svg aria-hidden="true" viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
            <circle
              cx="22"
              cy="22"
              r="20"
              fill="none"
              stroke="var(--color-sidebar-2)"
              strokeWidth="3"
            />
            <circle
              cx="22"
              cy="22"
              r="20"
              fill="none"
              stroke="var(--color-flash)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - pct / 100)}
              className="transition-[stroke-dashoffset] duration-500"
            />
          </svg>
        )}
      </button>
    </>
  );
}
