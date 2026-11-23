import { ChevronDown } from "lucide-react";
import { SegmentedControl } from "../../components/SegmentedControl";
import { formatClock, formatShortDate, plural } from "../../lib/format";
import { daysSince, isStale } from "./metrics";
import {
  NINETY_DAYS_TOOLTIP,
  type PlatformPage,
  useOverviewFilters,
  usePlatformNav,
} from "./filters";

/** "● Last pulled 16 Nov, 16:20" (green) / "● Last pulled 6 Nov · 10 days ago" (amber, > 7 days). */
export function LastPulled({
  startedAt,
  className = "",
}: {
  startedAt: string;
  className?: string;
}) {
  const stale = isStale(startedAt);
  const days = daysSince(startedAt);
  const text = stale
    ? `Last pulled ${formatShortDate(startedAt)} · ${plural(days, "day")} ago`
    : `Last pulled ${formatShortDate(startedAt)}, ${formatClock(startedAt)}`;
  return (
    <p
      className={`items-center gap-2 font-mono text-small ${stale ? "text-amber-text" : "text-muted"} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${stale ? "bg-amber" : "bg-fresh"}`}
      />
      <span>
        {text}
        {stale && <span className="sr-only"> (data is more than a week old)</span>}
      </span>
    </p>
  );
}

/** Tablet/desktop date range: 7 / 30 days, 90 shown disabled with a tooltip. */
export function DateRangeControl({ className = "" }: { className?: string }) {
  const { days, setDays } = useOverviewFilters();
  return (
    <SegmentedControl
      label="Date range"
      className={className}
      value={String(days) as "7" | "30" | "90"}
      onChange={(v) => setDays(v === "7" ? 7 : 30)}
      options={[
        { value: "7", label: "7 days" },
        { value: "30", label: "30 days" },
        { value: "90", label: "90 days", disabled: true, tooltip: NINETY_DAYS_TOOLTIP },
      ]}
    />
  );
}

/** Mobile date range (M02): a compact "30 days ⌄" select; 90 days listed but disabled. */
export function DateRangeSelect({ className = "" }: { className?: string }) {
  const { days, setDays } = useOverviewFilters();
  return (
    <label className={`relative inline-flex ${className}`}>
      <span className="sr-only">Date range</span>
      <select
        value={days}
        onChange={(e) => setDays(e.target.value === "7" ? 7 : 30)}
        title="90 days needs a 90-day pull, coming later"
        className="min-h-11 appearance-none rounded-control border border-line bg-surface pr-8 pl-3 text-body-sm"
      >
        <option value="7">7 days</option>
        <option value="30">30 days</option>
        <option value="90" disabled>
          90 days
        </option>
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted"
      />
    </label>
  );
}

/**
 * All / Instagram / TikTok / LinkedIn — navigation, not a filter: All = /overview, the others their own
 * page. The current page is selected. Mobile (M02) shortens Instagram to "IG".
 */
export function PlatformNav({ current }: { current: PlatformPage }) {
  const go = usePlatformNav();
  return (
    <SegmentedControl
      label="Platform"
      value={current}
      onChange={(to) => to !== current && go(to)}
      options={[
        { value: "all", label: "All" },
        {
          value: "instagram",
          label: (
            <>
              <span className="md:hidden">IG</span>
              <span className="hidden md:inline">Instagram</span>
            </>
          ),
        },
        { value: "tiktok", label: "TikTok" },
        { value: "linkedin", label: "LinkedIn" },
      ]}
    />
  );
}
