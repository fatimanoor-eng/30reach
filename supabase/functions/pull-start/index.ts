// pull-start — estimate + live credits check; creates the pull and its tasks (Slice 5, screens 05 / 05f).
//
// POST { clientId, platforms?: ("instagram"|"tiktok"|"linkedin"|"facebook")[], preview?: boolean,
//        test?: { competitorId, platform } }   ← test mode: one brand × one platform, 2-page cap
//
// → { status: "preview" | "insufficient" | "started", estimate, credits, lastPullAt, brands, pullId? }
// → 409 { status: "running", pullId } if a pull is already running for this client;
//   409 { status: "other_running", clientName } if another client is pulling (one pull at a time, 17a).
//
// Only platforms the client tracks (Slice 17b: client_platforms on + supported); test pulls (dev page)
// aren't limited. Nothing tracked → 400 { error: "no_platforms" }.
//
// Credits check uses the MAXIMUM possible cost (Σ task page cap × 2; LinkedIn tasks cap at 2 pages,
// Facebook keeps the pull's cap of 4), so a pull can't overspend.

import {
  estimate,
  type RunningPull,
  runningConflict,
  PAGE_CAP,
  type Platform,
  PLATFORMS,
  TARGET_COLUMN,
  type TaskKey,
  taskKey,
  TEST_PAGE_CAP,
  trackedPlatforms,
  WINDOW_DAYS,
} from "../_shared/pull-logic.ts";
import {
  fetchCreditUsage,
  json,
  readJson,
  requireTeam,
  saveCreditsCache,
  withSupabase,
} from "../_shared/server.ts";

const isPlatform = (v: unknown): v is Platform => PLATFORMS.includes(v as Platform);

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const body = await readJson(req);
    const clientId = typeof body.clientId === "string" ? body.clientId : null;
    if (!clientId) return json({ error: "client_required" }, 400);

    const test = body.test as { competitorId?: unknown; platform?: unknown } | undefined;
    const isTest = !!test;
    if (isTest && (typeof test.competitorId !== "string" || !isPlatform(test.platform))) {
      return json({ error: "bad_test_target" }, 400);
    }
    const admin = ctx.supabaseAdmin;

    // The client's tracked platforms (Slice 17b). Test pulls pick one platform by hand.
    let tracked: Platform[] = PLATFORMS;
    if (!isTest) {
      const { data: rows, error: rowsError } = await admin
        .from("client_platforms")
        .select("platform, state")
        .eq("client_id", clientId);
      if (rowsError) return json({ error: "db_error" }, 500);
      tracked = trackedPlatforms(rows);
    }
    const platforms: Platform[] = isTest
      ? [test.platform as Platform]
      : Array.isArray(body.platforms)
        ? tracked.filter((p) => (body.platforms as unknown[]).includes(p))
        : tracked;
    if (platforms.length === 0) return json({ error: "no_platforms" }, 400);

    // One running pull across ALL clients (17a). Same client → resume it; another client → say who.
    const findRunning = async () =>
      (
        await admin
          .from("pulls")
          .select("id, client_id, clients(name)")
          .eq("status", "running")
          .limit(1)
          .maybeSingle()
      ).data as RunningPull;
    const conflict = runningConflict(await findRunning(), clientId);
    if (conflict) return json(conflict, 409);

    // One task per competitor × platform that has a handle.
    let query = admin
      .from("competitors")
      .select("id, name, instagram_handle, tiktok_handle, linkedin_url, facebook_url")
      .eq("client_id", clientId)
      .order("name");
    if (isTest) query = query.eq("id", test.competitorId as string);
    const { data: competitors, error: compError } = await query;
    if (compError) return json({ error: "db_error" }, 500);

    const tasks: (TaskKey & { name: string })[] = [];
    for (const platform of platforms) {
      for (const c of competitors ?? []) {
        if (c[TARGET_COLUMN[platform]]) tasks.push({ competitorId: c.id, platform, name: c.name });
      }
    }
    if (tasks.length === 0) return json({ error: "no_tasks" }, 400);

    // Estimate from the last successful real pull (per brand × platform), else spike defaults.
    const { data: lastPull } = await admin
      .from("pulls")
      .select("id, started_at")
      .eq("client_id", clientId)
      .eq("is_test", false)
      .in("status", ["done", "partial"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastCredits = new Map<string, number>();
    if (lastPull) {
      const { data: lastTasks } = await admin
        .from("pull_tasks")
        .select("competitor_id, platform, credits_used")
        .eq("pull_id", lastPull.id)
        .eq("status", "done");
      for (const t of lastTasks ?? []) {
        lastCredits.set(
          taskKey({ competitorId: t.competitor_id, platform: t.platform }),
          t.credits_used,
        );
      }
    }
    const pageCap = isTest ? TEST_PAGE_CAP : PAGE_CAP;
    const est = estimate(tasks, lastCredits, pageCap);

    // Live balance — never start blind.
    const credits = await fetchCreditUsage();
    if (!credits) return json({ error: "credits_unavailable" }, 502);
    await saveCreditsCache(admin, credits);

    const summary = {
      estimate: est,
      credits,
      lastPullAt: lastPull?.started_at ?? null,
      brands: new Set(tasks.map((t) => t.competitorId)).size,
      pageCap,
      windowDays: WINDOW_DAYS,
      isTest,
    };
    if (est.max > credits.remaining) return json({ status: "insufficient", ...summary });
    if (body.preview === true) return json({ status: "preview", ...summary });

    const { data: pull, error: pullError } = await admin
      .from("pulls")
      .insert({
        client_id: clientId,
        started_by: ctx.userClaims?.sub ?? null,
        platforms,
        status: "running",
        credits_estimated: est.expected,
        credits_before: credits.remaining,
        credits_budget: est.max,
        window_days: WINDOW_DAYS,
        is_test: isTest,
        page_cap: pageCap,
      })
      .select("id")
      .single();
    if (pullError?.code === "23505") {
      // Raced another tab or another client's pull.
      return json(runningConflict(await findRunning(), clientId) ?? { status: "running" }, 409);
    }
    if (pullError || !pull) return json({ error: "db_error" }, 500);

    const { error: tasksError } = await admin.from("pull_tasks").insert(
      tasks.map((t) => ({
        pull_id: pull.id,
        competitor_id: t.competitorId,
        platform: t.platform,
        status: "queued",
      })),
    );
    if (tasksError) {
      await admin.from("pulls").delete().eq("id", pull.id);
      return json({ error: "db_error" }, 500);
    }

    return json({ status: "started", pullId: pull.id, ...summary });
  }),
};
