// `suggest-names` Edge Function (27 Nov 2026): short names / aliases backfill. Team only.
//
// POST { clientId } →
//   200 { status: "ok", updated, names: [{ id, kind: "client" | "competitor", short_name, aliases }] }
//   200 { status: "done_before" }   (already ran for this client: names_suggested_at is set)
//   400 { error: "bad_client" } · 404 { error: "no_client" } · 429 { error: "rate_limited", retryAfter }
//
// Once per client (names_suggested_at, claimed first so two tabs can't both run it): one free Groq call
// suggests short names and obvious aliases for the client and its competitors that have none. It only fills
// empty fields, never overwrites what someone typed. The team reviews them in Client settings and the
// competitor panel. No Firecrawl credits.

import { isUuid } from "../_shared/ai-logic.ts";
import { aiFailure, groqJson } from "../_shared/ai-server.ts";
import {
  type NameItem,
  NAMES_SCHEMA,
  namesSystem,
  namesUser,
  validateNames,
} from "../_shared/names.ts";
import { userIdOf, json, readJson, requireTeam, withSupabase } from "../_shared/server.ts";

type Row = {
  id: string;
  name: string;
  website?: string | null;
  short_name: string | null;
  aliases: string[] | null;
};

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;
    const body = await readJson(req);
    if (!isUuid(body.clientId)) return json({ error: "bad_client" }, 400);
    const clientId = body.clientId as string;
    const db = ctx.supabase;

    // Claim it (the duplicate guard): only the first caller gets a row back.
    const { data: claimed } = await db
      .from("clients")
      .update({ names_suggested_at: new Date().toISOString() })
      .eq("id", clientId)
      .is("names_suggested_at", null)
      .select("id, name, website, short_name, aliases");
    const client = (claimed ?? [])[0] as Row | undefined;
    if (!client) {
      const { data: exists } = await db
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .maybeSingle();
      return exists ? json({ status: "done_before" }) : json({ error: "no_client" }, 404);
    }
    const { data: rivals } = await db
      .from("competitors")
      .select("id, name, short_name, aliases")
      .eq("client_id", clientId);

    // Only brands with nothing yet.
    const missing = (r: Row) => !r.short_name && !(r.aliases ?? []).length;
    const rows: (Row & { kind: "client" | "competitor" })[] = [
      ...(missing(client) ? [{ ...client, kind: "client" as const }] : []),
      ...((rivals ?? []) as Row[])
        .filter(missing)
        .map((r) => ({ ...r, kind: "competitor" as const })),
    ].slice(0, 25);
    if (!rows.length) return json({ status: "ok", updated: 0, names: [] });

    const items: NameItem[] = rows.map((r) => ({ name: r.name, website: r.website ?? null }));
    const result = await groqJson({
      admin: ctx.supabaseAdmin,
      fn: "suggest-names",
      clientId,
      actor: userIdOf(ctx),
      system: namesSystem(),
      user: namesUser(items),
      schema: NAMES_SCHEMA,
      maxTokens: 1200,
      validate: (raw) => validateNames(raw, items),
    });
    if (!result.ok) {
      // Let a later visit try again (nothing was suggested).
      await db.from("clients").update({ names_suggested_at: null }).eq("id", clientId);
      return aiFailure(result);
    }

    const names: { id: string; kind: string; short_name: string | null; aliases: string[] }[] = [];
    for (const [i, s] of result.value) {
      const row = rows[i];
      const patch = { short_name: s.shortName || null, aliases: s.aliases };
      // Never overwrite: only rows that are still empty.
      const { data: done } = await db
        .from(row.kind === "client" ? "clients" : "competitors")
        .update(patch)
        .eq("id", row.id)
        .is("short_name", null)
        .select("id");
      if (done?.length) names.push({ id: row.id, kind: row.kind, ...patch });
    }
    return json({ status: "ok", updated: names.length, names });
  }),
};
