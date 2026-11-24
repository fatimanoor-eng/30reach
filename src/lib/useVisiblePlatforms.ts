import { type Platform, PLATFORMS, platformsWithAccounts } from "./platforms";
import { useCompetitors } from "./useCompetitors";

/**
 * Platforms to offer in the platform switch, sidebar and rail (Slice 16b): those at least one competitor
 * has a handle / page for. `current` (the page you're on) is always kept, so a direct link to a platform
 * nobody has still shows its segment and its empty state. While competitors load (or if they fail) every
 * platform is shown, so nothing flickers away.
 */
export function useVisiblePlatforms(current?: Platform | "all"): Platform[] {
  const competitors = useCompetitors();
  const withAccounts = platformsWithAccounts(competitors.data ?? null);
  return PLATFORMS.filter((p) => withAccounts.includes(p) || p === current);
}
