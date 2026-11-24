import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../lib/useClient";
import type { OverviewPost } from "./metrics";

export type SavedPull = { id: string; started_at: string; status: "done" | "partial" };

const POST_COLUMNS =
  "id, competitor_id, platform, external_id, url, posted_at, format, caption, hashtags, likes, comments, views, shares, counts_hidden, thumbnail_path";

/** The two newest REAL pulls (done/partial). Test pulls never show on dashboards. */
export function useSavedPulls() {
  const client = useClient();
  const clientId = client.data?.id;
  return useQuery({
    queryKey: ["pulls", "saved", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pulls")
        .select("id, started_at, status")
        .eq("client_id", clientId!)
        .eq("is_test", false)
        .in("status", ["done", "partial"])
        .order("started_at", { ascending: false })
        .limit(2);
      if (error) throw error;
      const [latest = null, previous = null] = (data ?? []) as SavedPull[];
      return { latest, previous };
    },
  });
}

/** All posts of one pull, minus rows the team hid (e.g. reposts). */
export function usePullPosts(pullId: string | null | undefined) {
  return useQuery({
    queryKey: ["posts", pullId],
    enabled: !!pullId,
    staleTime: Infinity, // a saved pull never changes
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(POST_COLUMNS)
        .eq("pull_id", pullId!)
        .eq("hidden", false);
      if (error) throw error;
      return (data ?? []) as OverviewPost[];
    },
  });
}

/** Signed URLs for thumbnails in the private post-thumbs bucket (1 hour). */
export function useThumbnails(paths: string[]) {
  const key = [...paths].sort();
  return useQuery({
    queryKey: ["thumbs", key],
    enabled: key.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("post-thumbs")
        .createSignedUrls(key, 3600);
      if (error) throw error;
      return new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl]));
    },
  });
}
