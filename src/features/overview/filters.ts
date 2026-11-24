import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { Platform } from "../../lib/platforms";
import type { Filters } from "./metrics";
import { useClientPath } from "../../lib/useClient";

/**
 * Date range lives in the URL (?days=7) so a view can be shared and survives a reload. Brand pills stay
 * in the shared selection context (Overview ↔ Instagram ↔ TikTok ↔ LinkedIn). Only 7 and 30 days: pulls
 * cover 30 days (90 is shown disabled). Platform is not a filter: it's the page (/overview = All,
 * /instagram, /tiktok, /linkedin).
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

export type PlatformPage = "all" | Platform;
const PATH: Record<PlatformPage, string> = {
  all: "/overview",
  instagram: "/instagram",
  tiktok: "/tiktok",
  linkedin: "/linkedin",
  facebook: "/facebook",
};

/**
 * All / Instagram / TikTok / LinkedIn / Facebook switch = navigation. Keeps the date range (query string); the brand
 * selection lives in context, so it carries over on its own.
 */
export function usePlatformNav() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const path = useClientPath();
  // Drops ?posts=all: the expanded post list belongs to the page you're leaving.
  return (to: PlatformPage) => navigate(path(platformHref(to, search)));
}

/**
 * Link to a platform page with the current query string (date range) kept, plus extra params —
 * e.g. { posts: "all" } opens Top posts expanded. Brand selection is in context, so it carries over.
 */
export function platformHref(
  to: PlatformPage,
  search: string,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams(search);
  params.delete("platform");
  params.delete("posts");
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const qs = params.toString();
  return `${PATH[to]}${qs ? `?${qs}` : ""}`;
}

export const NINETY_DAYS_TOOLTIP = "Needs a 90-day pull, coming later";
