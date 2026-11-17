import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { Filters } from "./metrics";

/**
 * Date range lives in the URL (?days=7) so a view can be shared and survives a reload. Brand pills stay
 * in the shared selection context (Overview ↔ Instagram ↔ TikTok). Only 7 and 30 days: pulls cover 30
 * days (90 is shown disabled). Platform is not a filter: it's the page (/overview, /instagram, /tiktok).
 */
export function useOverviewFilters() {
  const [params, setParams] = useSearchParams();
  const days: Filters["days"] = params.get("days") === "7" ? 7 : 30;

  return {
    days,
    setDays: (d: 7 | 30) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (d === 30) next.delete("days");
          else next.set("days", String(d));
          return next;
        },
        { replace: true },
      ),
  };
}

export type PlatformPage = "both" | "instagram" | "tiktok";
const PATH: Record<PlatformPage, string> = {
  both: "/overview",
  instagram: "/instagram",
  tiktok: "/tiktok",
};

/**
 * Both / Instagram / TikTok switch = navigation. Keeps the date range (query string); the brand
 * selection lives in context, so it carries over on its own.
 */
export function usePlatformNav() {
  const navigate = useNavigate();
  const { search } = useLocation();
  return (to: PlatformPage) => {
    const params = new URLSearchParams(search);
    params.delete("platform"); // old ?platform= links from before this was navigation
    const qs = params.toString();
    navigate(`${PATH[to]}${qs ? `?${qs}` : ""}`);
  };
}

export const NINETY_DAYS_TOOLTIP = "Needs a 90-day pull, coming later";
