import { callFunction } from "../../lib/pulls/api";
import type { Platform } from "../../lib/pulls/api";
import { supabase } from "../../lib/supabase";
import type { Competitor } from "../../lib/useCompetitors";

export type CheckResult =
  | { kind: "ok" | "not_found"; creditsUsed: number }
  /** Couldn't get an answer (nothing marked wrong); `message` is shown next to Save. */
  | { kind: "failed"; message: string };

/**
 * `check-handle` Edge Function: 0 credits if the handle / LinkedIn page doesn't exist, up to 2 if it
 * does. For LinkedIn `handle` is the canonical company page URL.
 */
export async function checkHandle(platform: Platform, handle: string): Promise<CheckResult> {
  const r = await callFunction<{ status: "ok" | "not_found"; creditsUsed: number }>(
    "check-handle",
    { platform, handle },
  );
  if (r.ok) return { kind: r.data.status, creditsUsed: r.data.creditsUsed ?? 0 };
  const code = String(r.data?.error ?? "");
  const retryAfter = Number(r.data?.retryAfter);
  const message =
    r.status === 409 || code === "pull_running"
      ? "A pull is running. Save again when it finishes."
      : r.status === 402 || code === "insufficient"
        ? `Not enough Firecrawl credits left to check ${platform === "linkedin" ? "a page" : "a handle"} (needs 2).`
        : r.status === 429 || code === "rate_limited"
          ? `Firecrawl asked us to slow down. Try Save again in ${Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 30} s.`
          : r.status === 0
            ? "Couldn’t reach the server. Check your connection and try again."
            : `Couldn’t check the ${platform === "linkedin" ? "page" : "handle"} right now. Nothing was saved for it; try again.`;
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
