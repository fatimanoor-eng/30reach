/**
 * Firecrawl credits meter (sidebar, More page). Sample number until the `credits` function exists (Slice 4/5).
 * Bar = credits LEFT as a share of the plan, in B30 Flash.
 */
export function CreditsMeter({
  remaining,
  plan,
  resetsOn,
  variant = "sidebar",
}: {
  remaining: number;
  plan: number;
  resetsOn: string;
  variant?: "sidebar" | "card";
}) {
  const pct = Math.max(0, Math.min(100, (remaining / plan) * 100));
  const card = variant === "card";

  return (
    <div className={card ? "on-dark rounded-card bg-ink p-4 text-white" : "text-white"}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono-label text-sidebar-text">Firecrawl credits</span>
        <span className="mono-label">{remaining.toLocaleString("en-US")} left</span>
      </div>
      <div
        role="meter"
        aria-label="Firecrawl credits left"
        aria-valuemin={0}
        aria-valuemax={plan}
        aria-valuenow={remaining}
        aria-valuetext={`${remaining} of ${plan} credits left`}
        className={`mt-2 h-1 overflow-hidden rounded-full ${card ? "bg-sidebar-2" : "bg-sidebar-line"}`}
      >
        <div className="h-full rounded-full bg-flash" style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-2 text-sidebar-text ${card ? "text-small" : "text-label"}`}>
        of {plan.toLocaleString("en-US")} · live · resets {resetsOn}
      </p>
    </div>
  );
}
