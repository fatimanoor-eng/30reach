import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useParams } from "react-router";
import { useAuth } from "./auth/auth-context";
import type { Profile } from "./auth/useProfile";
import { type ClientSummary, clientPath } from "./client-path";
import { supabase } from "./supabase";

export { clientInitials } from "./client-path";
export type { ClientSummary } from "./client-path";

const CLIENT_COLUMNS =
  "id, slug, name, initials, brand_color, logo_path, website, is_demo, archived_at, archived_by";

/** This browser's last client (fallback when the profile can't be read). */
export const LAST_CLIENT_KEY = "30reach:last-client";

export function readStoredSlug(): string | null {
  try {
    return localStorage.getItem(LAST_CLIENT_KEY);
  } catch {
    return null;
  }
}

/** The client slug in the URL (/c/{slug}/…), Slice 17b. */
export function useClientSlug(): string | undefined {
  return useParams().clientSlug;
}

/**
 * The client in the URL. `data` is null when no client has that slug (the shell shows "Client not
 * found"). Every feature reads its client from here, so the whole app follows the URL.
 */
export function useClient() {
  const { status } = useAuth();
  const slug = useClientSlug();
  return useQuery({
    queryKey: ["client", slug],
    enabled: status === "team" && !!slug,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(CLIENT_COLUMNS)
        .eq("slug", slug!)
        .maybeSingle();
      if (error) throw error;
      return data as ClientSummary | null;
    },
  });
}

/** Every client (switcher, redirects). Archived ones too: the caller decides. */
export function useClients() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["clients"],
    enabled: status === "team",
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select(CLIENT_COLUMNS).order("name");
      if (error) throw error;
      return (data ?? []) as ClientSummary[];
    },
  });
}

/**
 * When each client was last pulled (switcher meta). Real, finished pulls only; at most 2 are kept per
 * client, so this stays small.
 */
export function useLastPulls(enabled = true) {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["pulls", "last-per-client"],
    enabled: status === "team" && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pulls")
        .select("client_id, started_at")
        .eq("is_test", false)
        .in("status", ["done", "partial"])
        .order("started_at", { ascending: false });
      if (error) throw error;
      const last = new Map<string, string>();
      for (const p of (data ?? []) as { client_id: string; started_at: string }[]) {
        if (!last.has(p.client_id)) last.set(p.client_id, p.started_at);
      }
      return last;
    },
  });
}

/** Links inside the current client: path("/ideas?idea=1") → "/c/obu-health/ideas?idea=1". */
export function useClientPath() {
  const slug = useClientSlug();
  return useCallback((path: string) => (slug ? clientPath(slug, path) : path), [slug]);
}

/**
 * Remember the client you opened: in this browser right away, and on your profile (any device) through
 * set_last_client (profiles stay admin-only to write directly). Failures are ignored: it's a nicety.
 */
export function useRememberClient(client: ClientSummary | null | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("set_last_client", { p_client: id });
      if (error) throw error;
      return id;
    },
    onSuccess: (id) =>
      queryClient.setQueryData<Profile | null>(["profile", user?.id], (p) =>
        p ? { ...p, last_client_id: id } : p,
      ),
  });
  const { mutate } = save;
  // Archived clients aren't remembered (17c): their links send you back to your last active one.
  const id = client?.archived_at ? undefined : client?.id;
  const slug = client?.archived_at ? undefined : client?.slug;
  useEffect(() => {
    if (!id || !slug) return;
    try {
      localStorage.setItem(LAST_CLIENT_KEY, slug);
    } catch {
      // Private mode / blocked storage: the profile still remembers it.
    }
    const profile = queryClient.getQueryData<Profile | null>(["profile", user?.id]);
    if (profile?.last_client_id !== id) mutate(id);
  }, [id, slug, mutate, queryClient, user?.id]);
}
