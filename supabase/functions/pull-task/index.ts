// pull-task — fetches ONE page for one brand × platform task (Slice 5).
//
// POST { taskId } → { taskId, status: "running"|"done"|"failed", more, pages, postsFound, creditsUsed,
//                      errorCode?, stopReason? }
// The browser calls it again while `more` is true. One page per call keeps every call short and makes
// a reload lose at most one page.
//
// Safety: the call claims the task (lease) so two tabs can't fetch the same page; the pull's
// credits_budget and the page cap are checked before every page; not_found (hidden in a 200) costs 0.

import {
  CREDITS_PER_PAGE,
  cutoffFor,
  decideNextPage,
  type MappedPost,
  parsePage,
  type Platform,
  postColumns,
  postsInWindow,
  STATUS_COLUMN,
  TARGET_COLUMN,
  taskPageCap,
  thumbnailPath,
} from "../_shared/pull-logic.ts";
import {
  FirecrawlHttpError,
  FirecrawlRateLimited,
  json,
  readJson,
  recordUsage,
  requireTeam,
  scrapePage,
  type SupabaseClient,
  withSupabase,
} from "../_shared/server.ts";

const LEASE_MS = 150_000; // ≥ the function's wall-clock limit
const THUMB_MAX_BYTES = 300 * 1024; // = post-thumbs bucket limit
const THUMB_TYPES = /^image\/(jpeg|webp)\b/; // = post-thumbs allowed types

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const { taskId } = await readJson(req);
    if (typeof taskId !== "string") return json({ error: "task_required" }, 400);
    const admin = ctx.supabaseAdmin;

    // ── claim the task (only one caller at a time)
    const now = new Date();
    const { data: task } = await admin
      .from("pull_tasks")
      .update({ status: "running", lease_until: new Date(now.getTime() + LEASE_MS).toISOString() })
      .eq("id", taskId)
      .in("status", ["queued", "running"])
      .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
      .select("*")
      .maybeSingle();

    if (!task) {
      const { data: current } = await admin
        .from("pull_tasks")
        .select("id, status, pages, posts_found, credits_used, error_code")
        .eq("id", taskId)
        .maybeSingle();
      if (!current) return json({ error: "task_not_found" }, 404);
      if (current.status === "done" || current.status === "failed")
        return json(summary(current, false));
      return json({ error: "busy" }, 409); // another tab is fetching this task right now
    }
    if (!task.started_at) {
      await admin.from("pull_tasks").update({ started_at: now.toISOString() }).eq("id", task.id);
    }

    const release = (patch: Record<string, unknown>) =>
      admin
        .from("pull_tasks")
        .update({ ...patch, lease_until: null })
        .eq("id", task.id)
        .select("id, status, pages, posts_found, credits_used, error_code")
        .single();

    const { data: pull } = await admin
      .from("pulls")
      .select(
        "id, client_id, status, started_at, window_days, page_cap, credits_budget, clients(name)",
      )
      .eq("id", task.pull_id)
      .single();
    if (!pull || pull.status !== "running") {
      await release({});
      return json({ error: "pull_not_running" }, 409);
    }

    const platform = task.platform as Platform;
    const pageCap = taskPageCap(platform, pull.page_cap);
    const { data: competitor } = await admin
      .from("competitors")
      .select("id, instagram_handle, tiktok_handle, linkedin_url, facebook_url, facebook_followers")
      .eq("id", task.competitor_id)
      .single();
    // Handle (Instagram/TikTok) or page URL (LinkedIn company page, Facebook page).
    const handle: string | null = competitor?.[TARGET_COLUMN[platform]] ?? null;
    if (!handle) {
      const { data } = await release({
        status: "failed",
        error_code: "no_handle",
        finished_at: now.toISOString(),
      });
      return json(summary(data, false));
    }

    // ── budget for the whole pull (never overspend)
    const { data: spentRows } = await admin
      .from("pull_tasks")
      .select("credits_used")
      .eq("pull_id", pull.id);
    const spent = (spentRows ?? []).reduce((sum, r) => sum + (r.credits_used ?? 0), 0);
    const budgetLeft = (pull.credits_budget ?? 0) - spent;
    if (budgetLeft < CREDITS_PER_PAGE || task.pages >= pageCap) {
      const { data } = await release({
        status: "done",
        cursor: null,
        error_code: budgetLeft < CREDITS_PER_PAGE ? "budget" : null,
        finished_at: now.toISOString(),
      });
      return json(summary(data, false));
    }

    // ── one page from Firecrawl
    let body: unknown;
    try {
      body = await scrapePage(platform, handle, task.cursor);
    } catch (err) {
      await release({}); // retryable: the browser can call again
      if (err instanceof FirecrawlRateLimited) {
        // Free plan rate limit: tell the browser to slow down (not charged; page not fetched).
        console.error(
          `pull-task: Firecrawl rate limited (429, retry-after ${err.retryAfter ?? "none"})`,
        );
        return json({ error: "rate_limited", retryable: true, retryAfter: err.retryAfter }, 429);
      }
      const status = err instanceof FirecrawlHttpError ? err.status : 0;
      console.error(`pull-task: Firecrawl failed (${status || (err as Error).name})`);
      return json(
        { error: "firecrawl_unavailable", retryable: true, upstream: status || null },
        502,
      );
    }

    const page = parsePage(platform, body, task.pages);
    // Usage (Slice 17a): every page's credits, per client (0-credit pages aren't recorded).
    await recordUsage(admin, {
      kind: "pull",
      clientId: pull.client_id,
      clientName: (pull as { clients?: { name?: string } | null }).clients?.name ?? null,
      credits: page.creditsCost,
      fn: "pull-task",
      refId: pull.id,
      actor: ctx.userClaims?.sub ?? null,
    });
    const creditsUsed = task.credits_used + page.creditsCost;
    const pages = task.pages + 1;

    if (page.kind === "error") {
      if (page.code === "not_found") {
        await admin
          .from("competitors")
          .update({ [STATUS_COLUMN[platform]]: "not_found" })
          .eq("id", competitor!.id);
      }
      const { data } = await release({
        status: "failed",
        error_code: page.code,
        error: page.message.slice(0, 300),
        credits_used: creditsUsed,
        pages,
        cursor: null,
        finished_at: new Date().toISOString(),
      });
      return json(summary(data, false));
    }

    // ── save posts inside the window, copy thumbnails before the links expire
    const cutoffMs = cutoffFor(pull.started_at, pull.window_days);
    const keep = postsInWindow(page.posts, cutoffMs);
    let saved: Awaited<ReturnType<typeof savePosts>>;
    try {
      saved = await savePosts(admin, pull.id, pull.client_id, competitor!.id, keep);
    } catch (err) {
      // Credits for this page are recorded so the budget stays honest; the page can be retried.
      await release({ credits_used: creditsUsed });
      console.error(`pull-task: ${(err as Error).message}`);
      return json({ error: "save_failed", retryable: true }, 500);
    }
    await copyThumbnails(admin, pull.client_id, pull.id, keep, saved);

    const decision = decideNextPage({
      posts: page.posts,
      nextCursor: page.nextCursor,
      cutoffMs,
      pagesDone: pages,
      pageCap,
      budgetLeft: budgetLeft - page.creditsCost,
    });
    await admin
      .from("competitors")
      .update({ [STATUS_COLUMN[platform]]: "ok" })
      .eq("id", competitor!.id);

    const { data } = await release({
      status: decision.more ? "running" : "done",
      cursor: decision.more ? page.nextCursor : null,
      pages,
      credits_used: creditsUsed,
      posts_found: task.posts_found + keep.length,
      // Facebook posts carry no follower count: use the one saved when the page was checked (16a).
      followers:
        page.followers ??
        task.followers ??
        (platform === "facebook" ? (competitor?.facebook_followers ?? null) : null),
      error_code: !decision.more && decision.reason === "budget" ? "budget" : null,
      finished_at: decision.more ? null : new Date().toISOString(),
    });
    return json({
      ...summary(data, decision.more),
      stopReason: decision.more ? null : decision.reason,
    });
  }),
};

type TaskSummaryRow = {
  id: string;
  status: string;
  pages: number;
  posts_found: number;
  credits_used: number;
  error_code: string | null;
} | null;

function summary(row: TaskSummaryRow, more: boolean) {
  return {
    taskId: row?.id,
    status: row?.status,
    more,
    pages: row?.pages ?? 0,
    postsFound: row?.posts_found ?? 0,
    creditsUsed: row?.credits_used ?? 0,
    errorCode: row?.error_code ?? null,
  };
}

/** Upsert on (pull_id, platform, external_id) — retrying a page never duplicates posts. */
async function savePosts(
  admin: SupabaseClient,
  pullId: string,
  clientId: string,
  competitorId: string,
  posts: MappedPost[],
): Promise<Map<string, { id: string; thumbnail_path: string | null }>> {
  if (posts.length === 0) return new Map();
  const rows = posts.map((p) => ({
    ...postColumns(p),
    pull_id: pullId,
    client_id: clientId,
    competitor_id: competitorId,
  }));
  const { data, error } = await admin
    .from("posts")
    .upsert(rows, { onConflict: "pull_id,platform,external_id" })
    .select("id, external_id, thumbnail_path");
  if (error) throw new Error(`posts upsert failed (${error.code})`);
  return new Map((data ?? []).map((r) => [r.external_id, r]));
}

/** Download each thumbnail (links expire in days) and store it as delivered. 4 at a time. */
async function copyThumbnails(
  admin: SupabaseClient,
  clientId: string,
  pullId: string,
  posts: MappedPost[],
  saved: Map<string, { id: string; thumbnail_path: string | null }>,
) {
  const jobs = posts.filter(
    (p) =>
      p.thumbnail_source && saved.get(p.external_id) && !saved.get(p.external_id)!.thumbnail_path,
  );
  for (let i = 0; i < jobs.length; i += 4) {
    await Promise.all(
      jobs.slice(i, i + 4).map(async (p) => {
        try {
          const res = await fetch(p.thumbnail_source!, { signal: AbortSignal.timeout(15_000) });
          const type = res.headers.get("content-type") ?? "";
          if (!res.ok || !THUMB_TYPES.test(type)) return;
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.byteLength > THUMB_MAX_BYTES) return;
          const postId = saved.get(p.external_id)!.id;
          const path = thumbnailPath(clientId, pullId, postId, type);
          const { error } = await admin.storage
            .from("post-thumbs")
            .upload(path, bytes, { contentType: type.split(";")[0], upsert: true });
          if (!error) await admin.from("posts").update({ thumbnail_path: path }).eq("id", postId);
        } catch {
          // No thumbnail → the UI shows the soft block with the format tag.
        }
      }),
    );
  }
}
