import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { ModalPresence } from "../../components/ModalPresence";
import { SegmentedControl } from "../../components/SegmentedControl";
import { PLATFORM_ICON, PLATFORM_NAME } from "../../lib/platforms";
import { useVisiblePlatforms } from "../../lib/useVisiblePlatforms";
import type { Platform } from "../../lib/platforms";
import { lastPulledLine } from "./metrics";
import {
  NINETY_DAYS_TOOLTIP,
  type PlatformPage,
  useOverviewFilters,
  usePlatformNav,
} from "./filters";

/**
 * "● Last pulled 16 Nov, 16:20" (green) / "● Last pulled 6 Nov · 10 days ago" (amber, > 7 days). 18b: data
 * carried from an older pull says so ("· TikTok from 16 Nov"; a carried platform's page: "From the 16 Nov
 * pull"), and the oldest data shown decides amber.
 */
export function LastPulled({
  startedAt,
  carried,
  platform,
  className = "",
}: {
  startedAt: string;
  carried?: Partial<Record<Platform, string>> | null;
  platform?: Platform;
  className?: string;
}) {
  const { text, stale } = lastPulledLine({ startedAt, carried, platform, names: PLATFORM_NAME });
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
 * Tablet/desktop platform switch (Slice 16b) — navigation, not a filter: All = /overview, the others
 * their own page. Only platforms a competitor has an account on (plus the page you're on). Desktop: icon +
 * short label (All · IG · TikTok · LinkedIn · FB); tablet: icons only, named by aria-label + tooltip.
 */
export function PlatformNav({ current }: { current: PlatformPage }) {
  const go = usePlatformNav();
  const visible = useVisiblePlatforms(current);
  return (
    <SegmentedControl
      label="Platform"
      value={current}
      onChange={(to) => to !== current && go(to)}
      options={[
        { value: "all", label: "All" },
        ...visible.map((p) => {
          const Icon = PLATFORM_ICON[p];
          return {
            value: p,
            ariaLabel: PLATFORM_NAME[p],
            tooltip: PLATFORM_NAME[p],
            // Polish: "All" + icon-only segments at every width (names in the tooltip and aria-label).
            label: (
              <span className="inline-flex items-center px-0.5 align-middle">
                <Icon size={16} aria-hidden="true" />
              </span>
            ),
          };
        }),
      ]}
    />
  );
}

/**
 * Phone platform switch (Slice 16b): a "Platform  Instagram ⌄" chip that opens a bottom sheet with one
 * row per platform (only those a competitor has an account on, plus the current page). Overview's sheet
 * starts with "All"; the Social tab's doesn't (All is the Overview tab).
 */
export function PlatformPicker({
  current,
  includeAll = false,
  className = "",
}: {
  current: PlatformPage;
  includeAll?: boolean;
  className?: string;
}) {
  const go = usePlatformNav();
  const visible = useVisiblePlatforms(current);
  const [open, setOpen] = useState(false);
  const options: PlatformPage[] = [...(includeAll ? (["all"] as const) : []), ...visible];
  const name = (p: PlatformPage) => (p === "all" ? "All platforms" : PLATFORM_NAME[p]);
  const CurrentIcon = current === "all" ? null : PLATFORM_ICON[current];
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Platform: ${name(current)}. Change platform`}
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface pr-2.5 pl-3 text-body-sm ${className}`}
      >
        <span className="font-mono text-label text-muted uppercase">Platform</span>
        {CurrentIcon && <CurrentIcon size={16} aria-hidden="true" />}
        <span className="min-w-0 truncate">
          {current === "all" ? "All" : PLATFORM_NAME[current]}
        </span>
        <ChevronDown size={16} aria-hidden="true" className="ml-auto shrink-0 text-muted" />
      </button>
      <ModalPresence open={open}>
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Platform">
          <ul className="-mx-2 flex flex-col gap-1">
            {options.map((p) => {
              const Icon = p === "all" ? LayoutGrid : PLATFORM_ICON[p];
              const selected = p === current;
              return (
                <li key={p}>
                  <button
                    type="button"
                    aria-current={selected ? "page" : undefined}
                    onClick={() => {
                      setOpen(false);
                      if (!selected) go(p);
                    }}
                    className={`flex min-h-13 w-full items-center gap-3 rounded-control px-3 text-left text-body hover:bg-bg ${selected ? "font-medium" : ""}`}
                  >
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-bg">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    {name(p)}
                    {selected && <Check size={18} aria-hidden="true" className="ml-auto" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </BottomSheet>
      </ModalPresence>
    </>
  );
}
