import { type Platform, PLATFORMS, platformsWithAccounts } from "./platforms";
import { useTrackedPlatforms } from "./useClientPlatforms";
import { useCompetitors } from "./useCompetitors";

/**
 * Platforms to offer in the platform switch, sidebar and rail: those the client tracks (Slice 17b,
 * `client_platforms` on + supported) that at least one competitor has a handle / page for (Slice 16b).
 * `current` (the page you're on) is always kept, so a direct link still shows its segment and its empty
 * state. While either list loads (or if it fails) it doesn't narrow, so nothing flickers away.
 */
export function useVisiblePlatforms(current?: Platform | "all"): Platform[] {
  const competitors = useCompetitors();
  const tracked = useTrackedPlatforms() ?? PLATFORMS;
  const withAccounts = platformsWithAccounts(competitors.data ?? null);
  return PLATFORMS.filter(
    (p) => (tracked.includes(p) && withAccounts.includes(p)) || p === current,
  );
}
