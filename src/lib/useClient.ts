import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth/auth-context";
import { supabase } from "./supabase";

/** MVP: one client, OBU Health (seeded). Its id scopes every pull. */
export const CLIENT_SLUG = "obu-health";

/** Avatar initials for a client: first two letters of the first word ("OBU Health" → "OB"). */
export function clientInitials(name: string): string {
  return (name.trim().split(/\s+/)[0] ?? "").slice(0, 2).toUpperCase();
}

export function useClient() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["client", CLIENT_SLUG],
    enabled: status === "team",
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("slug", CLIENT_SLUG)
        .single();
      if (error) throw error;
      return data as { id: string; name: string };
    },
  });
}
