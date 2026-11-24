import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth/auth-context";
import { supabase } from "../../lib/supabase";
import type { UsageOverview } from "./usage-rules";

/**
 * usage_overview() (Slice 17f): per-client usage since `from` (the Firecrawl billing month) and credits by
 * week since `weeksFrom`. Team only; read-only.
 */
export function useUsageOverview(from: string | null, weeksFrom: string) {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["usage_overview", from, weeksFrom],
    enabled: status === "team" && !!from,
    staleTime: 60_000,
    queryFn: async (): Promise<UsageOverview> => {
      const { data, error } = await supabase.rpc("usage_overview", {
        p_from: from,
        p_weeks_from: weeksFrom,
      });
      if (error) throw error;
      const d = (data ?? {}) as Partial<UsageOverview>;
      return {
        clients: (d.clients ?? []).map((c) => ({
          ...c,
          credits: Number(c.credits) || 0,
          pull_credits: Number(c.pull_credits) || 0,
          check_credits: Number(c.check_credits) || 0,
          scan_credits: Number(c.scan_credits) || 0,
          groq_requests: Number(c.groq_requests) || 0,
          pulls: Number(c.pulls) || 0,
          storage_bytes: Number(c.storage_bytes) || 0,
          posts: Number(c.posts) || 0,
          ideas: Number(c.ideas) || 0,
          cards: Number(c.cards) || 0,
        })),
        weeks: (d.weeks ?? []).map((w) => ({
          ...w,
          credits: Number(w.credits) || 0,
          pulls: Number(w.pulls) || 0,
        })),
        unassigned: Number(d.unassigned) || 0,
      };
    },
  });
}
