import { AlertTriangle, Check } from "lucide-react";
import { BlipThinking } from "../../components/blip/BlipPoses";
import { AI_COPY, type ClaimIssue } from "../../lib/ai/ai-api";

export type HealthCheckState =
  | { state: "checking" }
  | { state: "clear" }
  | { state: "flagged"; issues: ClaimIssue[] }
  | { state: "failed"; rateLimited: boolean };

/**
 * 09 / M08 health-claim note ("Compliance", Figma 6905:2358). Advisory only: the card is already
 * saved when this shows, and nothing here ever blocks saving. Green when clear, red with the flagged
 * phrases when not (no red variant in Figma: same shape, Spark tones).
 */
export function HealthCheck({ value, onRetry }: { value: HealthCheckState; onRetry: () => void }) {
  if (value.state === "checking")
    return (
      <p
        role="status"
        className="flex items-center gap-2.5 rounded-tile bg-bg px-3 py-2.5 text-small text-muted"
      >
        <BlipThinking className="h-7 w-auto shrink-0" />
        Checking for health claims…
      </p>
    );

  if (value.state === "clear")
    return (
      <p
        role="status"
        className="flex items-center gap-2.5 rounded-tile bg-status-approved px-3 py-2.5 text-small font-medium text-fresh"
      >
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-fresh text-white">
          <Check size={12} strokeWidth={3} aria-hidden="true" />
        </span>
        No health claims found. Supportive tone, no food guilt.
      </p>
    );

  if (value.state === "flagged")
    return (
      <div
        role="status"
        className="flex items-start gap-2.5 rounded-tile bg-spark-tint px-3 py-2.5 text-small text-spark-text"
      >
        <span className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-spark-text text-white">
          <AlertTriangle size={11} strokeWidth={2.5} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="font-medium">
            {value.issues.length === 1 ? "1 phrase" : `${value.issues.length} phrases`} to look at
            before filming:
          </p>
          <ul className="flex flex-col gap-1">
            {value.issues.map((i) => (
              <li key={i.quote} className="break-words">
                <q className="font-medium">{i.quote}</q> · {i.why}
              </li>
            ))}
          </ul>
          <p className="text-muted-strong">Advisory only. Saving is never blocked.</p>
        </div>
      </div>
    );

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile bg-bg px-3 py-2.5 text-small text-muted-strong"
    >
      <p>
        Couldn’t check this time. The card is saved.
        {value.rateLimited && <span className="block text-muted">{AI_COPY.rateLimited}</span>}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 font-medium text-blue hover:underline md:min-h-0"
      >
        Check again
      </button>
    </div>
  );
}
