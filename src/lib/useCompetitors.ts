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
  instagram_status: "unchecked" | "ok" | "not_found";
  tiktok_status: "unchecked" | "ok" | "not_found";
  linkedin_status: "unchecked" | "ok" | "not_found";
  facebook_status: "unchecked" | "ok" | "not_found";
  x_status: "unchecked" | "ok" | "not_found";
  /** Facebook followers, read once when the page was saved or changed (AnyAPI), and when. */
  facebook_followers: number | null;
  facebook_followers_at: string | null;
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
          "id, name, initials, instagram_handle, tiktok_handle, linkedin_url, facebook_url, x_handle, instagram_status, tiktok_status, linkedin_status, facebook_status, x_status, facebook_followers, facebook_followers_at",
        )
        .eq("client_id", clientId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Competitor[];
    },
  });
}
