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
  instagram_status: "unchecked" | "ok" | "not_found";
  tiktok_status: "unchecked" | "ok" | "not_found";
  linkedin_status: "unchecked" | "ok" | "not_found";
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
          "id, name, initials, instagram_handle, tiktok_handle, linkedin_url, instagram_status, tiktok_status, linkedin_status",
        )
        .eq("client_id", clientId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Competitor[];
    },
  });
}
