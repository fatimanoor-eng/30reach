import { type FollowerTask, followerTable } from "./followers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../lib/useClient";
import type { Platform } from "../../lib/platforms";
import type { OverviewPost } from "./metrics";

export type SavedPull = {
  id: string;
  started_at: string;
  status: "done" | "partial";
  /** 18b: platforms copied from an older pull (not pulled this time) → the date their data is from. */
  carried?: Partial<Record<Platform, string>> | null;
};

const POST_COLUMNS =
  "id, competitor_id, platform, external_id, url, posted_at, format, caption, hashtags, likes, comments, views, shares, counts_hidden, thumbnail_path, duration_seconds";

/**
 * YouTube's developer policies: its statistics may be kept 30 days at most. pull-finish deletes YouTube
 * posts in pulls older than that, but only when someone pulls, so the app also stops showing them.
 */
export const YOUTUBE_KEEP_DAYS = 30;
export function withoutExpiredYouTube<T extends { platform: string }>(
  posts: T[],
  pullStartedAt: string | null | undefined,
  now: number = Date.now(),
): T[] {
  if (!pullStartedAt) return posts;
  const expired = now - Date.parse(pullStartedAt) > YOUTUBE_KEEP_DAYS * 24 * 60 * 60 * 1000;
  return expired ? posts.filter((p) => p.platform !== "youtube") : posts;
}

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
        .select("id, started_at, status, carried")
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
      const [{ data, error }, { data: pull }] = await Promise.all([
        supabase.from("posts").select(POST_COLUMNS).eq("pull_id", pullId!).eq("hidden", false),
        supabase.from("pulls").select("started_at, carried").eq("id", pullId!).maybeSingle(),
      ]);
      if (error) throw error;
      // A carried YouTube (18b) counts from its own date, not this pull's.
      const p = pull as { started_at?: string; carried?: { youtube?: string } | null } | null;
      return withoutExpiredYouTube(
        (data ?? []) as OverviewPost[],
        p?.carried?.youtube ?? p?.started_at,
      );
    },
  });
}

/**
 * Did this pull's X search stop at its page cap (Slice 17g fix)? pull-task marks the X leader task
 * `error_code = 'page_cap'` then. False for pulls made before that, and while it loads.
 */
export function useXCapped(pullId: string | null | undefined, enabled = true) {
  const q = useQuery({
    queryKey: ["x_capped", pullId],
    enabled: enabled && !!pullId,
    staleTime: Infinity, // a saved pull never changes
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pull_tasks")
        .select("id")
        .eq("pull_id", pullId!)
        .eq("platform", "x")
        .eq("error_code", "page_cap")
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
  return q.data === true;
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

/**
 * Follower readings of the latest and previous pulls (26 Nov): counts, growth and engagement rate come
 * from what every pull already saved (pull_tasks.followers). No credits. Null pull ids → an empty table.
 */
export function useFollowerTable(latestId: string | null | undefined, previousId?: string | null) {
  return useQuery({
    queryKey: ["followers", latestId, previousId ?? null],
    enabled: !!latestId,
    staleTime: Infinity, // saved pulls never change
    queryFn: async () => {
      const ids = [latestId!, ...(previousId ? [previousId] : [])];
      const { data, error } = await supabase
        .from("pull_tasks")
        .select("pull_id, competitor_id, platform, followers, error_code")
        .in("pull_id", ids);
      if (error) throw error;
      const rows = (data ?? []) as (FollowerTask & { pull_id: string })[];
      return followerTable(
        rows.filter((r) => r.pull_id === latestId),
        rows.filter((r) => r.pull_id === previousId),
      );
    },
  });
}
