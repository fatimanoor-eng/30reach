// pull-task — fetches ONE page for one brand × platform task (Slice 5).
//
// POST { taskId } → { taskId, status: "running"|"done"|"failed", more, pages, postsFound, creditsUsed,
//                      errorCode?, stopReason? }
// The browser calls it again while `more` is true. One page per call keeps every call short and makes
// a reload lose at most one page.
//
// Safety: the call claims the task (lease) so two tabs can't fetch the same page; the pull's
// credits_budget and the page cap are checked before every page; not_found (hidden in a 200) costs 0.
//
// X (Slice 17g): the pull's first X task (by id) is the "leader": it runs ONE search for every brand's X
// handle (`(from:a OR from:b) since:… -filter:replies -filter:retweets`, ≤ 3 pages × 5 credits) and saves
// each brand's posts on that brand's task. The other X tasks answer "busy" until the leader finishes, then
// they're already done. If the combined search fails on its first call (it can time out), every X task
// switches to "solo": one page of its own `from:handle` search.

import {
  cutoffFor,
  decideNextPage,
  type MappedPost,
  parsePage,
  pageCredits,
  type Platform,
  postColumns,
  postsInWindow,
  STATUS_COLUMN,
  TARGET_COLUMN,
  taskPageCap,
  thumbnailPath,
  splitByAuthor,
  X_SOLO_PAGE_CAP,
  xNeedsFallback,
  xQuery,
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
/** X (17g): an X task's cursor after the combined search failed: search this brand on its own. */
const X_SOLO = "x:solo";
const TERMINAL = ["done", "failed"];

type XTask = {
  id: string;
  status: string;
  cursor: string | null;
  posts_found: number;
  followers: number | null;
  competitor_id: string;
  competitors: { x_handle: string | null } | null;
};

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
    const xSolo = platform === "x" && task.cursor === X_SOLO;
    const pageCap = xSolo ? X_SOLO_PAGE_CAP : taskPageCap(platform, pull.page_cap);
    const perPage = pageCredits(platform);
    const { data: competitor } = await admin
      .from("competitors")
      .select(
        "id, instagram_handle, tiktok_handle, linkedin_url, facebook_url, facebook_followers, x_handle",
      )
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

    // ── X: one combined search, run by the leader (see the top of this file)
    let xGroup: XTask[] = [];
    if (platform === "x" && !xSolo) {
      const { data: xs } = await admin
        .from("pull_tasks")
        .select("id, status, cursor, posts_found, followers, competitor_id, competitors(x_handle)")
        .eq("pull_id", pull.id)
        .eq("platform", "x")
        .order("id");
      xGroup = (xs ?? []) as unknown as XTask[];
      const leader = xGroup[0];
      if (leader && leader.id !== task.id) {
        if (leader.cursor === X_SOLO) {
          // The combined search failed just now: this brand gets its own search on the next call.
          const { data } = await release({ status: "queued", cursor: X_SOLO });
          return json(summary(data, true));
        }
        if (!TERMINAL.includes(leader.status)) {
          await release({});
          return json({ error: "busy" }, 409); // the browser waits and asks again
        }
        // The leader finished without closing this task (e.g. it stopped mid-way): its posts are saved.
        const { data: lead } = await admin
          .from("pull_tasks")
          .select("status, error_code")
          .eq("id", leader.id)
          .single();
        const { data } = await release({
          status: lead?.status === "failed" ? "failed" : "done",
          error_code: lead?.status === "failed" ? lead.error_code : null,
          cursor: null,
          finished_at: now.toISOString(),
        });
        return json(summary(data, false));
      }
    }
    const xFollowers = xGroup.slice(1);
    /** Leader finished: close the other X tasks the same way (none went solo: that happens before). */
    const closeFollowers = async (status: "done" | "failed", errorCode: string | null) => {
      const open = xFollowers.filter((t) => !TERMINAL.includes(t.status)).map((t) => t.id);
      if (!open.length) return;
      await admin
        .from("pull_tasks")
        .update({
          status,
          error_code: errorCode,
          cursor: null,
          lease_until: null,
          finished_at: new Date().toISOString(),
        })
        .in("id", open);
    };
    /** First combined call failed (timeout, too long): every open X task searches on its own instead. */
    const goSolo = async (creditsCost: number, why: string) => {
      console.error(`pull-task: X combined search failed (${why}); one search per brand`);
      const open = xFollowers.filter((t) => !TERMINAL.includes(t.status)).map((t) => t.id);
      if (open.length) {
        await admin.from("pull_tasks").update({ status: "queued", cursor: X_SOLO }).in("id", open);
      }
      const { data } = await release({
        status: "running",
        cursor: X_SOLO,
        credits_used: task.credits_used + creditsCost,
      });
      return json(summary(data, true));
    };
    const canGoSolo = platform === "x" && !xSolo && task.pages === 0 && xFollowers.length > 0;
    // The X search: every brand (leader) or this brand alone (solo); the window's first day as since:.
    const cutoffMs = cutoffFor(pull.started_at, pull.window_days);
    const xHandles = new Map<string, string>(
      xSolo
        ? [[handle.toLowerCase(), competitor!.id]]
        : xGroup
            .filter((t) => t.competitors?.x_handle)
            .map((t) => [t.competitors!.x_handle!.toLowerCase(), t.competitor_id]),
    );
    const target = platform === "x" ? xQuery([...xHandles.keys()], cutoffMs) : handle;
    const providerCursor = xSolo ? null : task.cursor;

    // ── budget for the whole pull (never overspend)
    const { data: spentRows } = await admin
      .from("pull_tasks")
      .select("credits_used")
      .eq("pull_id", pull.id);
    const spent = (spentRows ?? []).reduce((sum, r) => sum + (r.credits_used ?? 0), 0);
    const budgetLeft = (pull.credits_budget ?? 0) - spent;
    // A solo X task's failed combined call isn't a page of its own.
    const pagesSoFar = xSolo ? 0 : task.pages;
    if (budgetLeft < perPage || pagesSoFar >= pageCap) {
      const errorCode = budgetLeft < perPage ? "budget" : null;
      const { data } = await release({
        status: "done",
        cursor: null,
        error_code: errorCode,
        finished_at: now.toISOString(),
      });
      await closeFollowers("done", errorCode);
      return json(summary(data, false));
    }

    // ── one page from Firecrawl
    let body: unknown;
    try {
      body = await scrapePage(platform, target, providerCursor);
    } catch (err) {
      const status = err instanceof FirecrawlHttpError ? err.status : 0;
      if (canGoSolo && (xNeedsFallback(null, status) || (err as Error).name === "TimeoutError")) {
        return await goSolo(0, status ? `HTTP ${status}` : "timeout");
      }
      await release({}); // retryable: the browser can call again
      if (err instanceof FirecrawlRateLimited) {
        // Free plan rate limit: tell the browser to slow down (not charged; page not fetched).
        console.error(
          `pull-task: Firecrawl rate limited (429, retry-after ${err.retryAfter ?? "none"})`,
        );
        return json({ error: "rate_limited", retryable: true, retryAfter: err.retryAfter }, 429);
      }
      console.error(`pull-task: Firecrawl failed (${status || (err as Error).name})`);
      return json(
        { error: "firecrawl_unavailable", retryable: true, upstream: status || null },
        502,
      );
    }

    const page = parsePage(platform, body, pagesSoFar);
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
    const pages = pagesSoFar + 1;

    if (page.kind === "error" && canGoSolo && xNeedsFallback(page.code)) {
      return await goSolo(page.creditsCost, page.code);
    }
    if (page.kind === "error") {
      // An X search has no "not found" per account (handles are checked when they're added).
      if (page.code === "not_found" && platform !== "x") {
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
      await closeFollowers("failed", page.code);
      return json(summary(data, false));
    }

    // ── save posts inside the window, copy thumbnails before the links expire
    const keep = postsInWindow(page.posts, cutoffMs);
    // X: one search holds several brands' posts → save each on its own brand (others are dropped).
    const byBrand =
      platform === "x" ? splitByAuthor(keep, xHandles) : new Map([[competitor!.id, keep]]);
    const mine = byBrand.get(competitor!.id) ?? [];
    try {
      for (const [competitorId, posts] of byBrand) {
        const saved = await savePosts(admin, pull.id, pull.client_id, competitorId, posts);
        await copyThumbnails(admin, pull.client_id, pull.id, posts, saved);
      }
    } catch (err) {
      // Credits for this page are recorded so the budget stays honest; the page can be retried.
      await release({ credits_used: creditsUsed });
      console.error(`pull-task: ${(err as Error).message}`);
      return json({ error: "save_failed", retryable: true }, 500);
    }

    const decision = decideNextPage({
      posts: page.posts,
      nextCursor: page.nextCursor,
      cutoffMs,
      pagesDone: pages,
      pageCap,
      budgetLeft: budgetLeft - page.creditsCost,
      pageCost: perPage,
      unordered: platform === "x",
    });
    // X leader: the other brands' posts and followers go on their own tasks.
    const followersOf = (competitorId: string) => {
      const h = [...xHandles].find(([, id]) => id === competitorId)?.[0];
      return h ? (page.followersBy?.[h] ?? null) : null;
    };
    for (const t of xFollowers) {
      const found = byBrand.get(t.competitor_id)?.length ?? 0;
      const followers = followersOf(t.competitor_id);
      if (!found && followers === null) continue;
      await admin
        .from("pull_tasks")
        .update({
          posts_found: t.posts_found + found,
          followers: followers ?? t.followers,
        })
        .eq("id", t.id);
    }
    await admin
      .from("competitors")
      .update({ [STATUS_COLUMN[platform]]: "ok" })
      .eq("id", competitor!.id);

    const { data } = await release({
      status: decision.more ? "running" : "done",
      cursor: decision.more ? page.nextCursor : null,
      pages,
      credits_used: creditsUsed,
      posts_found: task.posts_found + mine.length,
      // Facebook posts carry no follower count: use the one saved when the page was checked (16a).
      followers:
        page.followers ??
        (platform === "x" ? followersOf(competitor!.id) : null) ??
        task.followers ??
        (platform === "facebook" ? (competitor?.facebook_followers ?? null) : null),
      // X leader (17g fix): "page_cap" when the combined search stopped at its 3 pages with more to read,
      // so the X page can say it shows only the latest ~60 posts. A done task's code isn't a problem.
      error_code: decision.more
        ? null
        : decision.reason === "budget"
          ? "budget"
          : platform === "x" && !xSolo && decision.reason === "page_cap"
            ? "page_cap"
            : null,
      finished_at: decision.more ? null : new Date().toISOString(),
    });
    if (!decision.more)
      await closeFollowers("done", decision.reason === "budget" ? "budget" : null);
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
