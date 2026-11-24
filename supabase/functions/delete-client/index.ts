// `delete-client` Edge Function: "Delete permanently" (16d), Slice 17c. Team (everyone can delete clients,
// Fatima 24 Nov), but only an ARCHIVED client, typed name checked in the browser and again here.
//
// POST { clientId, confirmName } →
//   200 { deleted: true, name }
//   400 { error: "bad_client" | "name_mismatch" }
//   404 { error: "no_client" }
//   409 { error: "not_archived" }    archive first (16b): delete is only offered for archived clients
//   409 { error: "pull_running" }    this client's pull is running: wait for it
//
// Storage doesn't cascade with rows, so files go first: every object under `{client}/` in post-thumbs,
// idea-images and client-logos (+ a scanned logo under scans/). Then usage_events keep the client's name (their client_id becomes null on
// delete), and the client row goes; competitors, pulls, posts, ideas, comments, calendar cards and
// client_platforms cascade. Uses 0 Firecrawl credits.

import { isUuid } from "../_shared/ai-logic.ts";
import {
  json,
  readJson,
  requireTeam,
  type SupabaseClient,
  withSupabase,
} from "../_shared/server.ts";

const BUCKETS = ["post-thumbs", "idea-images", "client-logos"];

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Remove every object under `prefix/` (folders listed recursively, 1,000 at a time). */
async function removeFolder(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<boolean> {
  for (let guard = 0; guard < 200; guard++) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) return false;
    if (!data || data.length === 0) return true;
    // Entries without an id are folders (e.g. post-thumbs/{client}/{pull}/).
    const files = data.filter((f) => f.id).map((f) => `${prefix}/${f.name}`);
    for (const folder of data.filter((f) => !f.id)) {
      if (!(await removeFolder(admin, bucket, `${prefix}/${folder.name}`))) return false;
    }
    if (files.length) {
      const { error: removeError } = await admin.storage.from(bucket).remove(files);
      if (removeError) return false;
    }
    if (data.length < 1000) return true;
  }
  return false;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const body = await readJson(req);
    const clientId = body.clientId;
    if (!isUuid(clientId)) return json({ error: "bad_client" }, 400);

    const admin = ctx.supabaseAdmin;
    const { data: client, error } = await admin
      .from("clients")
      .select("id, name, archived_at, logo_path")
      .eq("id", clientId)
      .maybeSingle();
    if (error) return json({ error: "load_failed" }, 500);
    if (!client) return json({ error: "no_client" }, 404);
    if (typeof body.confirmName !== "string" || norm(body.confirmName) !== norm(client.name)) {
      return json({ error: "name_mismatch" }, 400);
    }
    if (!client.archived_at) return json({ error: "not_archived" }, 409);

    const { data: running } = await admin
      .from("pulls")
      .select("id")
      .eq("client_id", clientId)
      .eq("status", "running")
      .limit(1);
    if (running && running.length) return json({ error: "pull_running" }, 409);

    for (const bucket of BUCKETS) {
      if (!(await removeFolder(admin, bucket, clientId))) {
        return json({ error: "storage_failed", bucket }, 500);
      }
    }
    // A logo from a website scan (Slice 17d) lives under scans/, outside the client's folder.
    if (client.logo_path && !client.logo_path.startsWith(`${clientId}/`)) {
      await admin.storage.from("client-logos").remove([client.logo_path]);
    }
    // Usage history keeps the name once client_id goes null.
    await admin
      .from("usage_events")
      .update({ client_name: client.name })
      .eq("client_id", clientId)
      .is("client_name", null);

    const { error: deleteError } = await admin.from("clients").delete().eq("id", clientId);
    if (deleteError) return json({ error: "delete_failed" }, 500);
    return json({ deleted: true, name: client.name });
  }),
};
