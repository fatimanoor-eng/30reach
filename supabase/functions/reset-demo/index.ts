// `reset-demo` Edge Function: the Demo client (Slice 17f). Team only. 0 Firecrawl credits.
//
// POST {} → 200 { slug, created: boolean }   500 { error: "demo_failed" }
//
// Creates "Demo Wellness Co" (is_demo) or refreshes it: its competitors, pulls (+ posts), ideas, calendar
// cards and platforms are replaced with made-up data dated relative to today (`_shared/demo-data.ts`).
// Pulls are off for the demo (pull-start refuses it); Blip works on the demo pulls. Written with the
// service role after the team check; nothing here touches any other client.

import { DEMO_CLIENT, DEMO_SLUG, demoData } from "../_shared/demo-data.ts";
import { json, requireTeam, withSupabase } from "../_shared/server.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const admin = ctx.supabaseAdmin;
    const data = demoData(new Date());
    const fail = (step: string, e: unknown) => {
      console.error(`reset-demo: ${step} failed (${(e as { code?: string })?.code ?? "unknown"})`);
      return json({ error: "demo_failed", step }, 500);
    };

    // The demo client: found by its flag + slug, never another client.
    const { data: existing } = await admin
      .from("clients")
      .select("id")
      .eq("slug", DEMO_SLUG)
      .eq("is_demo", true)
      .maybeSingle();
    let clientId = (existing as { id: string } | null)?.id ?? null;
    const created = !clientId;
    const { content_rules, ...fields } = DEMO_CLIENT;
    if (clientId) {
      // Clear the old demo rows (cards before ideas: ideas point at cards; posts go with their pulls).
      for (const table of ["calendar_cards", "ideas", "pulls", "competitors", "client_platforms"]) {
        const { error } = await admin.from(table).delete().eq("client_id", clientId);
        if (error) return fail(`clear ${table}`, error);
      }
      const { error } = await admin
        .from("clients")
        .update({ ...fields, content_rules, archived_at: null, archived_by: null })
        .eq("id", clientId);
      if (error) return fail("update client", error);
    } else {
      const { data: row, error } = await admin
        .from("clients")
        .insert({ ...fields, content_rules, created_by: ctx.userClaims?.sub ?? null })
        .select("id")
        .single();
      if (error || !row) return fail("insert client", error);
      clientId = (row as { id: string }).id;
    }

    const { error: pe } = await admin.from("client_platforms").insert(
      (["instagram", "tiktok"] as const).map((platform) => ({
        client_id: clientId,
        platform,
        state: "on",
        source: "team",
      })),
    );
    if (pe) return fail("platforms", pe);

    const { data: comps, error: ce } = await admin
      .from("competitors")
      .insert(
        data.competitors.map((c) => ({
          client_id: clientId,
          name: c.name,
          initials: c.initials,
          instagram_handle: c.instagram_handle,
          tiktok_handle: c.tiktok_handle,
          instagram_status: "ok",
          tiktok_status: "ok",
        })),
      )
      .select("id, name");
    if (ce || !comps) return fail("competitors", ce);
    const compId = new Map(
      data.competitors.map((c) => [
        c.key,
        (comps as { id: string; name: string }[]).find((x) => x.name === c.name)!.id,
      ]),
    );

    const pullId = new Map<string, string>();
    for (const p of data.pulls) {
      const { data: row, error } = await admin
        .from("pulls")
        .insert({
          client_id: clientId,
          platforms: ["instagram", "tiktok"],
          status: "done",
          credits_used: 0,
          started_at: p.started_at,
          finished_at: p.finished_at,
          window_days: 30,
          is_test: false,
        })
        .select("id")
        .single();
      if (error || !row) return fail("pulls", error);
      pullId.set(p.key, (row as { id: string }).id);
    }

    const { error: poe } = await admin.from("posts").insert(
      data.posts.map((p) => ({
        pull_id: pullId.get(p.pull),
        client_id: clientId,
        competitor_id: compId.get(p.competitor),
        platform: p.platform,
        external_id: p.external_id,
        url: p.url,
        posted_at: p.posted_at,
        format: p.format,
        caption: p.caption,
        hashtags: p.hashtags,
        likes: p.likes,
        comments: p.comments,
        views: p.views,
        shares: p.shares,
      })),
    );
    if (poe) return fail("posts", poe);

    const { error: ie } = await admin
      .from("ideas")
      .insert(data.ideas.map((i) => ({ ...i, client_id: clientId, created_by: null })));
    if (ie) return fail("ideas", ie);

    const { error: ke } = await admin
      .from("calendar_cards")
      .insert(data.cards.map((c) => ({ ...c, client_id: clientId, created_by: null })));
    if (ke) return fail("cards", ke);

    return json({ slug: DEMO_SLUG, created });
  }),
};
