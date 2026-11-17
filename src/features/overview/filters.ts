import { useSearchParams } from "react-router";
import type { Filters, PlatformFilter } from "./metrics";

/**
 * Platform + date range live in the URL (?platform=tiktok&days=7) so a view can be shared and survives
 * a reload. Brand pills stay in the shared selection context (Overview ↔ Instagram ↔ TikTok).
 * Only 7 and 30 days: pulls cover 30 days (90 is shown disabled).
 */
export function useOverviewFilters() {
  const [params, setParams] = useSearchParams();
  const platformParam = params.get("platform");
  const platform: PlatformFilter =
    platformParam === "instagram" || platformParam === "tiktok" ? platformParam : "both";
  const days: Filters["days"] = params.get("days") === "7" ? 7 : 30;

  const update = (key: "platform" | "days", value: string, fallback: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  return {
    platform,
    days,
    setPlatform: (p: PlatformFilter) => update("platform", p, "both"),
    setDays: (d: 7 | 30) => update("days", String(d), "30"),
  };
}

export const NINETY_DAYS_TOOLTIP = "Needs a 90-day pull, coming later";
