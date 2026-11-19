// `clear-pull` Edge Function: "Clear saved pull" in Settings (13), Slice 12. Admins only.
//
// POST { clientId } →
//   200 { deleted: number }          both saved pulls (and any failed / test leftovers) are gone
//   400 { error: "bad_client" } · 403 { error: "not_admin" }
//   409 { error: "pull_running" }    a Refresh is in progress: try again when it's done
//
// Deletes every pull of the client: their thumbnails in post-thumbs first (Storage doesn't cascade),
// then the rows (pull_tasks and posts cascade). The next Refresh starts fresh, with no "What's new".
// Saved ideas keep their own snapshot and thumbnail copy (ideas.source_post_id is set null).
// Uses 0 Firecrawl credits. Who can call it: admins (verify_jwt → withSupabase → is_admin()).

import { isUuid } from "../_shared/ai-logic.ts";
import { deleteThumbnails, json, readJson, requireAdmin, withSupabase } from "../_shared/server.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireAdmin(ctx);
    if (denied) return denied;

    const { clientId } = await readJson(req);
    if (!isUuid(clientId)) return json({ error: "bad_client" }, 400);

    const admin = ctx.supabaseAdmin;
    const { data: pulls, error } = await admin
      .from("pulls")
      .select("id, status")
      .eq("client_id", clientId);
    if (error) return json({ error: "load_failed" }, 500);
    const rows = (pulls ?? []) as { id: string; status: string }[];
    if (rows.some((p) => p.status === "running")) return json({ error: "pull_running" }, 409);
    if (rows.length === 0) return json({ deleted: 0 });

    for (const p of rows) await deleteThumbnails(admin, clientId, p.id);
    const { error: deleteError } = await admin
      .from("pulls")
      .delete()
      .in(
        "id",
        rows.map((p) => p.id),
      );
    if (deleteError) return json({ error: "delete_failed" }, 500);
    return json({ deleted: rows.length });
  }),
};
