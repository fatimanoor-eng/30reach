import { callFunction } from "../../lib/pulls/api";
import type { Platform } from "../../lib/pulls/api";
import { supabase } from "../../lib/supabase";
import type { Competitor } from "../../lib/useCompetitors";
import { CHECK_COST } from "./competitor-rules";

export type CheckResult =
  /** `followers`: Facebook only (AnyAPI reads them with the check); null elsewhere. */
  | { kind: "ok"; creditsUsed: number; followers: number | null }
  | { kind: "not_found"; creditsUsed: number }
  /** Couldn't get an answer (nothing marked wrong); `message` is shown next to Save. */
  | { kind: "failed"; message: string };

/**
 * `check-handle` Edge Function: 0 credits if the handle / page doesn't exist; up to 2 if it does
 * (Facebook up to 5, and the answer carries the page's followers). For LinkedIn / Facebook `handle` is
 * the canonical page URL.
 */
export async function checkHandle(
  platform: Platform,
  handle: string,
  clientId?: string,
): Promise<CheckResult> {
  const r = await callFunction<{
    status: "ok" | "not_found";
    creditsUsed: number;
    followers?: number | null;
  }>("check-handle", { platform, handle, clientId });
  if (r.ok) {
    const creditsUsed = r.data.creditsUsed ?? 0;
    return r.data.status === "ok"
      ? { kind: "ok", creditsUsed, followers: r.data.followers ?? null }
      : { kind: "not_found", creditsUsed };
  }
  const isPage = platform === "linkedin" || platform === "facebook";
  const code = String(r.data?.error ?? "");
  const retryAfter = Number(r.data?.retryAfter);
  const message =
    r.status === 409 || code === "pull_running"
      ? "A pull is running. Save again when it finishes."
      : r.status === 402 || code === "insufficient"
        ? `Not enough Firecrawl credits left to check ${isPage ? "a page" : "a handle"} (needs ${CHECK_COST[platform]}).`
        : r.status === 429 || code === "rate_limited"
          ? `Firecrawl asked us to slow down. Try Save again in ${Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 30} s.`
          : r.status === 0
            ? "Couldn’t reach the server. Check your connection and try again."
            : `Couldn’t check the ${isPage ? "page" : "handle"} right now. Nothing was saved for it; try again.`;
  return { kind: "failed", message };
}

export type CompetitorFields = Omit<Competitor, "id">;

/** Insert (id = null) or update a competitor; returns its id. RLS: team has full access. */
export async function saveCompetitor(
  clientId: string,
  id: string | null,
  fields: CompetitorFields,
): Promise<string> {
  if (id) {
    const { error } = await supabase.from("competitors").update(fields).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("competitors")
    .insert({ client_id: clientId, ...fields })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Plain delete. The database cascades to the brand's posts and pull tasks (dashboards drop it);
 * ideas keep their `source_snapshot` (source_post_id → null), so they stay on the idea board.
 */
export async function removeCompetitor(id: string): Promise<void> {
  const { error } = await supabase.from("competitors").delete().eq("id", id);
  if (error) throw error;
}
