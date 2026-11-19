// `clear-pull` Edge Function: "Clear saved pull" in Settings (13), Slice 12. Admins only.
//
// POST { clientId, which: "latest" | "previous" | "both", pullId? } →
//   200 { deleted: number }
//   400 { error: "bad_client" | "bad_which" } · 403 { error: "not_admin" }
//   404 { error: "no_pull" }          nothing saved to clear (or no previous pull)
//   409 { error: "pull_running" }     a Refresh is in progress: try again when it's done
//   409 { error: "pulls_changed" }    `pullId` (what the dialog showed) is no longer that pull
//
// The saved pulls are the two newest real ones (done / partial, not test), like the dashboards:
// • latest   → the dashboards show the previous pull; "What's new" disappears
// • previous → the dashboards stay; "What's new" disappears (nothing to compare with)
// • both     → every pull of the client (including failed / test leftovers): empty until the next
//              Refresh, which starts fresh
// Thumbnails in post-thumbs go first (Storage doesn't cascade), then the rows (pull_tasks and posts
// cascade). Saved ideas keep their own snapshot and thumbnail copy (ideas.source_post_id → null).
// Uses 0 Firecrawl credits. Who can call it: admins (verify_jwt → withSupabase → is_admin()).

import { isUuid } from "../_shared/ai-logic.ts";
import { deleteThumbnails, json, readJson, requireAdmin, withSupabase } from "../_shared/server.ts";

type Which = "latest" | "previous" | "both";
const WHICH: Which[] = ["latest", "previous", "both"];

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireAdmin(ctx);
    if (denied) return denied;

    const body = await readJson(req);
    const clientId = body.clientId;
    if (!isUuid(clientId)) return json({ error: "bad_client" }, 400);
    // Older browsers (before the choice existed) meant "both".
    const which = (body.which ?? "both") as Which;
    if (!WHICH.includes(which)) return json({ error: "bad_which" }, 400);

    const admin = ctx.supabaseAdmin;
    const { data: pulls, error } = await admin
      .from("pulls")
      .select("id, status, is_test, started_at")
      .eq("client_id", clientId)
      .order("started_at", { ascending: false });
    if (error) return json({ error: "load_failed" }, 500);
    const rows = (pulls ?? []) as {
      id: string;
      status: string;
      is_test: boolean;
      started_at: string;
    }[];
    if (rows.some((p) => p.status === "running")) return json({ error: "pull_running" }, 409);

    const saved = rows.filter((p) => !p.is_test && (p.status === "done" || p.status === "partial"));
    let ids: string[];
    if (which === "both") {
      ids = rows.map((p) => p.id);
    } else {
      const target = which === "latest" ? saved[0] : saved[1];
      if (!target) return json({ error: "no_pull" }, 404);
      if (body.pullId !== undefined && body.pullId !== target.id) {
        return json({ error: "pulls_changed" }, 409);
      }
      ids = [target.id];
    }
    if (ids.length === 0) return json({ error: "no_pull" }, 404);

    for (const id of ids) await deleteThumbnails(admin, clientId, id);
    const { error: deleteError } = await admin.from("pulls").delete().in("id", ids);
    if (deleteError) return json({ error: "delete_failed" }, 500);
    return json({ deleted: ids.length });
  }),
};
