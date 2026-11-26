import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useClient } from "./useClient";

export type Competitor = {
  id: string;
  name: string;
  initials: string;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  /** Canonical company page URL, https://www.linkedin.com/company/<slug>/ (Slice 15a). */
  linkedin_url: string | null;
  /** Canonical page URL, https://www.facebook.com/<slug> (Slice 16a). */
  facebook_url: string | null;
  /** X handle, lowercase without "@" (Slice 17g). */
  x_handle: string | null;
  /** YouTube @handle (lowercase, no "@") or a channel id "UC…" (Slice 18). */
  youtube_handle: string | null;
  instagram_status: "unchecked" | "ok" | "not_found";
  tiktok_status: "unchecked" | "ok" | "not_found";
  linkedin_status: "unchecked" | "ok" | "not_found";
  facebook_status: "unchecked" | "ok" | "not_found";
  x_status: "unchecked" | "ok" | "not_found";
  youtube_status: "unchecked" | "ok" | "not_found";
  /** YouTube: the channel id the check / first pull found, and the latest subscriber count (rounded). */
  youtube_channel_id: string | null;
  youtube_subscribers: number | null;
  /** Facebook followers, read once when the page was saved or changed (AnyAPI), and when. */
  facebook_followers: number | null;
  facebook_followers_at: string | null;
  /** Discovery 2.0: square 128 px logo in client-logos (site, or the Instagram / TikTok picture). */
  logo_path?: string | null;
  /** 27 Nov: shown where space is tight ("ABCU"); other names Blip treats as this brand. */
  short_name?: string | null;
  aliases?: string[];
};

/** The client's competitors (brand pills, leaderboard, first-run checklist). Pill order = name. */
export function useCompetitors() {
  const client = useClient();
  const clientId = client.data?.id;
  return useQuery({
    queryKey: ["competitors", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitors")
        .select(
          "id, name, initials, instagram_handle, tiktok_handle, linkedin_url, facebook_url, x_handle, youtube_handle, instagram_status, tiktok_status, linkedin_status, facebook_status, x_status, youtube_status, youtube_channel_id, youtube_subscribers, facebook_followers, facebook_followers_at, logo_path, short_name, aliases",
        )
        .eq("client_id", clientId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Competitor[];
    },
  });
}
