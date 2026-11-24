import { useQuery } from "@tanstack/react-query";
import { type Platform, trackedPlatforms } from "./platforms";
import { supabase } from "./supabase";
import { useClient } from "./useClient";

/**
 * The platforms the current client tracks (Slice 17b): its `client_platforms` rows that are on and that
 * 30reach supports. `null` while loading or if it fails, so nothing disappears on a slow load.
 */
export function useTrackedPlatforms(): Platform[] | null {
  const clientId = useClient().data?.id;
  const rows = useQuery({
    queryKey: ["client_platforms", clientId],
    enabled: !!clientId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_platforms")
        .select("platform, state")
        .eq("client_id", clientId!);
      if (error) throw error;
      return (data ?? []) as { platform: string; state: string }[];
    },
  });
  return rows.data ? trackedPlatforms(rows.data) : null;
}
