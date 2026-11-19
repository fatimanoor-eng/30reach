// Settings (13 / M12) data: team (team_members / set_member_role / set_member_access), usage
// (usage_sizes, usage_meters.groq), clear-pull (admin Edge Function) and the export fetchers.
// SQL: supabase/migrations/*_settings.sql. Everything is team-only on the server.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callFunction } from "../../lib/pulls/api";
import { supabase } from "../../lib/supabase";
import type { ExportCard, ExportIdea, ExportPost } from "./settings-export";
import type { GroqMeterRow, Member } from "./settings-rules";

export const TEAM_KEY = ["team_members"] as const;

/** Everyone who has signed in (active first, removed last), with their last sign-in. */
export function useTeam() {
  return useQuery({
    queryKey: TEAM_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("team_members");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });
}

/** A refusal from set_member_role / set_member_access, with its code ("last_admin", …). */
export class TeamError extends Error {
  constructor(readonly code: string | undefined) {
    super(code ?? "team_change_failed");
    this.name = "TeamError";
  }
}
// Postgres raises "last_admin" etc. as the message; PostgREST passes it through.
const codeOf = (message: string | undefined) => message?.match(/^[a-z_]+$/)?.[0];

export function useSetRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: "admin" | "member" }) => {
      const { error } = await supabase.rpc("set_member_role", { p_user: id, p_role: role });
      if (error) throw new TeamError(codeOf(error.message));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: TEAM_KEY });
      void queryClient.invalidateQueries({ queryKey: ["profile"] }); // my own role may have changed
    },
  });
}

export function useSetAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("set_member_access", { p_user: id, p_active: active });
      if (error) throw new TeamError(codeOf(error.message));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: TEAM_KEY }),
  });
}

/** Database size and Storage bytes per bucket (usage_sizes()). */
export function useUsageSizes() {
  return useQuery({
    queryKey: ["usage_sizes"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("usage_sizes");
      if (error) throw error;
      const d = (data ?? {}) as { database_bytes?: number; storage_bytes?: Record<string, number> };
      const buckets = d.storage_bytes ?? {};
      return {
        databaseBytes: Number(d.database_bytes ?? 0),
        storageBytes: Object.values(buckets).reduce((a, b) => a + Number(b), 0),
        buckets,
      };
    },
  });
}

/** The last Groq reading the AI functions saved (usage_meters, key 'groq'); null before any AI call. */
export function useGroqMeter() {
  return useQuery({
    queryKey: ["usage_meters", "groq"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_meters")
        .select("value, updated_at")
        .eq("key", "groq")
        .maybeSingle();
      if (error) throw error;
      return (data as GroqMeterRow | null) ?? null;
    },
  });
}

export class ClearPullError extends Error {
  constructor(readonly reason: "running" | "not_admin" | "failed") {
    super(reason);
    this.name = "ClearPullError";
  }
}

/** Deletes both saved pulls (admin Edge Function `clear-pull`). The next Refresh starts fresh. */
export function useClearPull(clientId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await callFunction<{ deleted: number }>("clear-pull", { clientId });
      if (res.ok) return res.data;
      if (res.status === 409) throw new ClearPullError("running");
      if (res.status === 403) throw new ClearPullError("not_admin");
      throw new ClearPullError("failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pulls"] });
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
      void queryClient.invalidateQueries({ queryKey: ["usage_sizes"] });
    },
  });
}

// ───────────────────────────── export fetchers (read what the team can already read)

/** The latest real pull (done / partial) and its visible posts; null if there's no pull yet. */
export async function fetchLatestPullPosts(clientId: string) {
  const { data: pull, error } = await supabase
    .from("pulls")
    .select("id, started_at")
    .eq("client_id", clientId)
    .eq("is_test", false)
    .in("status", ["done", "partial"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!pull) return null;
  const p = pull as { id: string; started_at: string };
  const { data, error: postsError } = await supabase
    .from("posts")
    .select(
      "competitor_id, platform, format, posted_at, url, caption, hashtags, likes, comments, views, counts_hidden",
    )
    .eq("pull_id", p.id)
    .eq("hidden", false);
  if (postsError) throw postsError;
  return { startedAt: p.started_at, posts: (data ?? []) as ExportPost[] };
}

export async function fetchIdeasForExport(clientId: string) {
  const { data, error } = await supabase
    .from("ideas")
    .select(
      "created_at, kind, note, link_url, platform, format, tags, source_snapshot, creator:profiles(full_name), planned:calendar_cards!ideas_planned_card_fk(date)",
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ExportIdea[];
}

export async function fetchCardsForExport(clientId: string) {
  const { data, error } = await supabase
    .from("calendar_cards")
    .select(
      "date, title, platform, format, status, hook, caption, visual_idea, origin, compliance_status, updated_at, creator:profiles(full_name)",
    )
    .eq("client_id", clientId)
    .order("date");
  if (error) throw error;
  return (data ?? []) as unknown as ExportCard[];
}
