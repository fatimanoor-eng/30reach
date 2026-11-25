// pull-finish — closes a pull: done / partial / failed, cleanup, fresh credits (Slice 5, 05d / 05g).
//
// POST { pullId } → { status, postsFound, creditsUsed, credits, problems: [{ brand, platform, code }], deleted,
//                     carried: { platform: ISO date } }
//
// Carry-over (Slice 18b): every platform the client tracks that this pull didn't get (not ticked in the
// Refresh dialog, or all its tasks failed, e.g. YouTube's daily limit) is copied from the previous pull:
// posts, follower counts (pull_tasks rows marked "carried", 0 credits) and thumbnails, before the "keep
// the last 2 pulls" cleanup. pulls.carried records each carried platform's real date.
// → 409 { error: "tasks_pending", pending } while tasks are still queued or running.
// Calling it again on a finished pull just returns the summary (safe to retry).

import {
  finishStatus,
  type PullRow,
  pullsToDelete,
  type TaskStatus,
} from "../_shared/pull-logic.ts";
import {
  deleteThumbnails,
  fetchCreditUsage,
  json,
  readJson,
  requireTeam,
  saveCreditsCache,
  type SupabaseClient,
  withSupabase,
} from "../_shared/server.ts";
import { youtubeExpiredPulls } from "../_shared/youtube-logic.ts";
import {
  type Carried,
  carriedPostRow,
  carriedTaskRow,
  carriedThumbPath,
  carryPlan,
} from "../_shared/carry-logic.ts";
import { trackedPlatforms } from "../_shared/pull-logic.ts";

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
    let carried: Carried = {};
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

      // 18b: platforms this pull didn't fetch are copied from the previous pull (no credits).
      if (!pull.is_test && status !== "failed") {
        carried = await carryOver(admin, pull as PullForCarry, all);
      }

      // Keep the last 2 pulls per client (CLAUDE.md rule 7) — rows cascade to tasks + posts.
      const { data: pulls } = await admin
        .from("pulls")
        .select("id, status, is_test, started_at, carried")
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
      // YouTube (18): its statistics may be kept 30 days at most (developer policies).
      const expired = youtubeExpiredPulls(
        ((pulls ?? []) as PullRow[]).filter((p) => !toDelete.includes(p.id)),
        Date.now(),
      );
      if (expired.length) await deleteYouTubePosts(admin, pull.client_id, expired);
    }

    return json({
      status,
      isTest: pull.is_test,
      postsFound: status === "failed" ? 0 : (postsFound ?? 0),
      creditsUsed,
      credits,
      problems,
      deleted,
      carried,
    });
  }),
};

/** Delete a client's YouTube posts in these pulls, and their stored thumbnails. */
async function deleteYouTubePosts(admin: SupabaseClient, clientId: string, pullIds: string[]) {
  const { data } = await admin
    .from("posts")
    .select("id, thumbnail_path")
    .eq("client_id", clientId)
    .eq("platform", "youtube")
    .in("pull_id", pullIds);
  const paths = (data ?? []).map((r) => r.thumbnail_path).filter((p): p is string => !!p);
  if (paths.length) await admin.storage.from("post-thumbs").remove(paths);
  if (data?.length) {
    const { error } = await admin
      .from("posts")
      .delete()
      .in(
        "id",
        data.map((r) => r.id),
      );
    if (error) console.error(`pull-finish: YouTube cleanup failed (${error.code})`);
  }
}

type PullForCarry = { id: string; client_id: string; started_at: string };

/** Copy the platforms this pull didn't get from the previous real pull. Returns what was carried. */
async function carryOver(
  admin: SupabaseClient,
  pull: PullForCarry,
  tasks: { platform: string; status: string }[],
): Promise<Carried> {
  const [{ data: previous }, { data: platformRows }] = await Promise.all([
    admin
      .from("pulls")
      .select("id, started_at, carried")
      .eq("client_id", pull.client_id)
      .eq("is_test", false)
      .in("status", ["done", "partial"])
      .neq("id", pull.id)
      .lt("started_at", pull.started_at)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("client_platforms").select("platform, state").eq("client_id", pull.client_id),
  ]);
  if (!previous) return {};
  const { data: prevTasks } = await admin
    .from("pull_tasks")
    .select("competitor_id, platform, followers, posts_found, status")
    .eq("pull_id", previous.id);
  const plan = carryPlan({
    tracked: trackedPlatforms(platformRows),
    tasks,
    previous: previous as { started_at: string; carried: Carried | null },
    previousPlatforms: [...new Set((prevTasks ?? []).map((t) => t.platform))],
    nowMs: Date.now(),
  });
  if (!plan.length) return {};
  const platforms = plan.map((s) => s.platform);
  const finishedAt = new Date().toISOString();

  // Follower counts and post counts (the leaderboard, Blip): one "carried" task per brand × platform.
  const taskRows = (prevTasks ?? [])
    .filter((t) => t.status === "done" && platforms.includes(t.platform))
    .map((t) => carriedTaskRow(t, pull.id, finishedAt));
  if (taskRows.length) {
    const { error } = await admin.from("pull_tasks").insert(taskRows);
    if (error) console.error(`pull-finish: carried tasks failed (${error.code})`);
  }

  // Posts, then their thumbnails (copied in Storage, so cleaning up the old pull can't remove them).
  const { data: oldPosts } = await admin
    .from("posts")
    .select("*")
    .eq("pull_id", previous.id)
    .in("platform", platforms);
  const rows = (oldPosts ?? []) as Record<string, unknown>[];
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { data: inserted, error } = await admin
      .from("posts")
      .insert(batch.map((r) => carriedPostRow(r, pull.id)))
      .select("id, platform, external_id");
    if (error) {
      console.error(`pull-finish: carried posts failed (${error.code})`);
      continue;
    }
    const newId = new Map(
      (inserted ?? []).map((r) => [`${r.platform}:${r.external_id}`, r.id as string]),
    );
    const thumbs = batch.filter((r) => typeof r.thumbnail_path === "string");
    for (let j = 0; j < thumbs.length; j += 6) {
      await Promise.all(
        thumbs.slice(j, j + 6).map(async (r) => {
          const id = newId.get(`${r.platform}:${r.external_id}`);
          if (!id) return;
          const to = carriedThumbPath(r.thumbnail_path as string, pull.client_id, pull.id, id);
          const { error: copyError } = await admin.storage
            .from("post-thumbs")
            .copy(r.thumbnail_path as string, to);
          if (!copyError) await admin.from("posts").update({ thumbnail_path: to }).eq("id", id);
        }),
      );
    }
  }

  const carried = Object.fromEntries(plan.map((s) => [s.platform, s.from])) as Carried;
  await admin.from("pulls").update({ carried }).eq("id", pull.id);
  return carried;
}
