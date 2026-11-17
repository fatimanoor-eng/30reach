// pull-finish — closes a pull: done / partial / failed, cleanup, fresh credits (Slice 5, 05d / 05g).
//
// POST { pullId } → { status, postsFound, creditsUsed, credits, problems: [{ brand, platform, code }], deleted }
// → 409 { error: "tasks_pending", pending } while tasks are still queued or running.
// Calling it again on a finished pull just returns the summary (safe to retry).

import {
  finishStatus,
  type PullRow,
  pullsToDelete,
  type TaskStatus,
} from "../_shared/pull-logic.ts";
import {
  fetchCreditUsage,
  json,
  readJson,
  requireTeam,
  saveCreditsCache,
  type SupabaseClient,
  withSupabase,
} from "../_shared/server.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const { pullId } = await readJson(req);
    if (typeof pullId !== "string") return json({ error: "pull_required" }, 400);
    const admin = ctx.supabaseAdmin;

    const { data: pull } = await admin
      .from("pulls")
      .select("id, client_id, status, is_test, started_at")
      .eq("id", pullId)
      .maybeSingle();
    if (!pull) return json({ error: "pull_not_found" }, 404);

    const { data: tasks } = await admin
      .from("pull_tasks")
      .select("status, platform, credits_used, error_code, competitors(name)")
      .eq("pull_id", pull.id);
    const all = tasks ?? [];
    const pending = all.filter((t) => t.status === "queued" || t.status === "running").length;
    if (pull.status === "running" && pending > 0)
      return json({ error: "tasks_pending", pending }, 409);

    const status =
      pull.status === "running"
        ? finishStatus(all.map((t) => t.status as TaskStatus))
        : pull.status;
    const creditsUsed = all.reduce((sum, t) => sum + (t.credits_used ?? 0), 0);
    const problems = all
      .filter((t) => t.status === "failed")
      .map((t) => ({
        brand: (t.competitors as { name?: string } | null)?.name ?? "Unknown brand",
        platform: t.platform,
        code: t.error_code ?? "failed",
      }));
    const { count: postsFound } = await admin
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("pull_id", pull.id);

    const credits = await fetchCreditUsage(); // 0 credits; refreshes the sidebar meter
    if (credits) await saveCreditsCache(admin, credits);

    let deleted = 0;
    if (pull.status === "running") {
      await admin
        .from("pulls")
        .update({
          status,
          finished_at: new Date().toISOString(),
          credits_used: creditsUsed,
          error_summary: problems.length
            ? problems
                .map((p) => `${p.brand} ${p.platform}: ${p.code}`)
                .join("; ")
                .slice(0, 500)
            : null,
        })
        .eq("id", pull.id);

      // Keep the last 2 pulls per client (CLAUDE.md rule 7) — rows cascade to tasks + posts.
      const { data: pulls } = await admin
        .from("pulls")
        .select("id, status, is_test, started_at")
        .eq("client_id", pull.client_id);
      const toDelete = pullsToDelete(
        ((pulls ?? []) as PullRow[]).map((p) => (p.id === pull.id ? { ...p, status } : p)),
        { ...(pull as PullRow), status },
      );
      for (const id of toDelete) await deleteThumbnails(admin, pull.client_id, id);
      if (toDelete.length) {
        await admin.from("pulls").delete().in("id", toDelete);
        deleted = toDelete.length;
      }
    }

    return json({
      status,
      isTest: pull.is_test,
      postsFound: status === "failed" ? 0 : (postsFound ?? 0),
      creditsUsed,
      credits,
      problems,
      deleted,
    });
  }),
};

/** Remove post-thumbs/{client}/{pull}/* (Storage doesn't cascade with the rows). */
async function deleteThumbnails(admin: SupabaseClient, clientId: string, pullId: string) {
  const folder = `${clientId}/${pullId}`;
  for (;;) {
    const { data, error } = await admin.storage.from("post-thumbs").list(folder, { limit: 1000 });
    if (error || !data || data.length === 0) return;
    const { error: removeError } = await admin.storage
      .from("post-thumbs")
      .remove(data.map((f) => `${folder}/${f.name}`));
    if (removeError || data.length < 1000) return;
  }
}
