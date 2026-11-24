import { Check, X as XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "../../../components/Logo";

/** The scan path (15b–15e). The manual path passes its own: Website → Details → First pull. */
const SCAN_STEPS = ["Website", "Scan", "Review", "First pull"];

/**
 * Add client frame (15b–15f, M14–M18): top bar with the 30reach logo, "Add client", the 4 steps (done =
 * ink ✓, current = Flash dot, next = outlined) and Close (no "Add client" label, Fatima 25 Nov).
 * Phones: "ADD CLIENT · STEP n OF 4" + the step
 * name, ✕, and four progress segments.
 */
export function AddClientShell({
  step,
  steps = SCAN_STEPS,
  onClose,
  children,
  footer,
}: {
  /** 1–4 */
  step: number;
  /** Step names; default = the scan path. */
  steps?: string[];
  onClose: () => void;
  children: ReactNode;
  /** Sticky bottom bar (Review). */
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg md:bg-surface">
        {/* Tablet / desktop */}
        <div className="hidden h-16 items-center justify-between gap-4 px-6 md:flex xl:px-8">
          <div className="flex items-center gap-4 xl:min-w-44">
            <Logo className="h-6 w-auto" />
          </div>
          <ol aria-label="Add client steps" className="flex items-center gap-2 xl:gap-3">
            {steps.map((label, i) => {
              const n = i + 1;
              const state = n < step ? "done" : n === step ? "current" : "next";
              return (
                <li key={label} className="flex items-center gap-2 xl:gap-3">
                  {i > 0 && <span aria-hidden="true" className="h-px w-4 bg-line lg:w-6 xl:w-10" />}
                  <span
                    aria-current={state === "current" ? "step" : undefined}
                    className={`flex items-center gap-2 text-small ${state === "next" ? "text-muted" : "text-ink"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-flex size-5 items-center justify-center rounded-full font-mono text-label ${
                        state === "done"
                          ? "bg-ink text-white"
                          : state === "current"
                            ? "bg-flash text-ink"
                            : "border border-line bg-surface text-muted"
                      }`}
                    >
                      {state === "done" ? <Check size={12} strokeWidth={3} /> : n}
                    </span>
                    {/* Tablet: only the current step is named, so the bar fits at 768 px. */}
                    <span className={state === "current" ? "" : "sr-only lg:not-sr-only"}>
                      {label}
                    </span>
                    {state === "done" && <span className="sr-only">(done)</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="flex justify-end xl:min-w-44">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-3 text-body-sm hover:bg-soft"
            >
              Close
              <XIcon size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Phones */}
        <div className="px-4 pt-3 pb-2 md:hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="mono-label text-muted">
                Add client · Step {step} of {steps.length}
              </p>
              <p className="text-body-sm font-medium">{steps[step - 1]}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 inline-flex size-11 items-center justify-center rounded-control"
            >
              <XIcon size={20} aria-hidden="true" />
            </button>
          </div>
          <div
            aria-hidden="true"
            className="mt-2 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
          >
            {steps.map((label, i) => (
              <span
                key={label}
                className={`h-1 rounded-full ${i + 1 < step ? "bg-ink" : i + 1 === step ? "bg-flash" : "bg-line"}`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
      {footer}
    </div>
  );
}
