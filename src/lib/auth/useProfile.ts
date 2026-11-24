import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { useAuth } from "./auth-context";

export type Profile = {
  role: "admin" | "member";
  full_name: string | null;
  /** The client this person last opened, on any device (Slice 17b). */
  last_client_id?: string | null;
};

/** The signed-in person's profile row (role for the sidebar / Settings, last client for redirects). */
export function useProfile() {
  const { status, user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: status === "team" && !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, full_name, last_client_id")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export function roleLabel(role: Profile["role"] | undefined): string {
  return role === "admin" ? "Admin" : role === "member" ? "Member" : "";
}
