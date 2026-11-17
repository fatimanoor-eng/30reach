import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth/auth-context";
import { formatNumber, formatShortDate, plural } from "./format";
import { supabase } from "./supabase";

/** Response of the `credits` Edge Function (supabase/functions/credits). */
export type Credits = {
  remaining: number;
  plan: number;
  periodStart: string | null;
  resetsAt: string | null;
  updatedAt: string;
  /** true = Firecrawl couldn't be reached; this is the last cached reading. */
  stale: boolean;
};

export type CreditsState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; credits: Credits };

export const CREDITS_QUERY_KEY = ["credits"] as const;

/**
 * Live Firecrawl credits. Fetched once when the app opens; the function itself caches for ~5 min.
 * Never refetches on focus (global setting). Slice 5 invalidates CREDITS_QUERY_KEY after a pull.
 */
export function useCredits(): CreditsState {
  const { status } = useAuth();
  const query = useQuery({
    queryKey: CREDITS_QUERY_KEY,
    enabled: status === "team",
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<Credits> => {
      const { data, error } = await supabase.functions.invoke<Credits>("credits", {
        method: "GET",
      });
      if (error) throw error;
      if (!data || typeof data.remaining !== "number" || typeof data.plan !== "number") {
        throw new Error("Unexpected response from the credits function");
      }
      return data;
    },
  });

  if (query.data) return { status: "ready", credits: query.data };
  if (query.isError) return { status: "error", retry: () => void query.refetch() };
  return { status: "loading" };
}

const hourMinute = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Reset date in the design's short format ("17 Dec"; year only if not this year). */
export function formatResetDate(iso: string | null): string | null {
  return formatShortDate(iso);
}

/** "2026-11-17T14:02:00Z" → "14:02" (local time). */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : hourMinute.format(d);
}

/** One line for tooltips / screen readers. */
export function creditsSummary(state: CreditsState): string {
  if (state.status === "loading") return "Checking Firecrawl credits…";
  if (state.status === "error") return "Couldn't load Firecrawl credits";
  const { remaining, plan, resetsAt, stale, updatedAt } = state.credits;
  const reset = formatResetDate(resetsAt);
  return [
    `${plural(remaining, "credit")} left of ${formatNumber(plan)}`,
    stale ? `as of ${formatTime(updatedAt)}` : null,
    reset ? `resets ${reset}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
