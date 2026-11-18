// `holidays` Edge Function — fills `holiday_cache` from Nager.Date (Slice 9, INTEGRATIONS.md §5).
//
// POST { year } →
//   200 { year, data: HolidayRow[], fetchedAt, stale }   stale = Nager failed, older cache returned
//   400 { error: "bad_year" }                             only last year … two years ahead
//   502 { error: "nager_unavailable" }                     Nager failed and nothing is cached
//
// Why a function: `holiday_cache` is read-only for the team (RLS), so the browser reads the cache
// itself and only calls this when a year is missing or older than 90 days. Runs only when someone
// opens the calendar — no cron. Nager.Date is free and needs no key.
//
// Who can call it: signed-in team members only (same three locks as `credits`):
//   verify_jwt = true (config.toml) → withSupabase({ auth: "user" }) → is_team() as the caller.

import { json, readJson, requireTeam, withSupabase } from "../_shared/server.ts";
import { COUNTRY, isFresh, nagerUrl, parseYear, slimNager } from "./logic.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const year = parseYear(await readJson(req), new Date().getUTCFullYear());
    if (year === null) return json({ error: "bad_year" }, 400);
    const admin = ctx.supabaseAdmin;

    const { data: cached } = await admin
      .from("holiday_cache")
      .select("data, fetched_at")
      .eq("year", year)
      .eq("country", COUNTRY)
      .maybeSingle();
    // Two people opening the calendar at once: the second call finds the first one's row.
    if (cached && isFresh(cached.fetched_at, Date.now())) {
      return json({ year, data: cached.data, fetchedAt: cached.fetched_at, stale: false });
    }

    let rows = null;
    try {
      const res = await fetch(nagerUrl(year), { signal: AbortSignal.timeout(10_000) });
      if (res.ok) rows = slimNager(await res.json(), year);
      else console.error(`holidays: Nager HTTP ${res.status}`);
    } catch (err) {
      console.error(`holidays: Nager failed (${(err as Error).name})`);
    }

    if (!rows) {
      if (cached) {
        return json({ year, data: cached.data, fetchedAt: cached.fetched_at, stale: true });
      }
      return json({ error: "nager_unavailable" }, 502);
    }

    const fetchedAt = new Date().toISOString();
    const { error } = await admin
      .from("holiday_cache")
      .upsert({ year, country: COUNTRY, data: rows, fetched_at: fetchedAt });
    if (error) console.error(`holidays: cache write failed (${error.code ?? "unknown"})`);
    return json({ year, data: rows, fetchedAt, stale: false });
  }),
};
