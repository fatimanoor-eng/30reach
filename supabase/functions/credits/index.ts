// `credits` Edge Function — live Firecrawl credit meter (Slice 4, INTEGRATIONS.md §2b).
//
// Who can call it: signed-in @breakthirty.com users only.
//   1. verify_jwt = true (supabase/config.toml): Supabase rejects missing/invalid tokens first.
//   2. withSupabase({ auth: "user" }) verifies the caller's JWT again in code.
//   3. is_team() is called AS THE CALLER — the same rule RLS uses on every table.
// Firecrawl's key comes from the FIRECRAWL_API_KEY secret and is never returned or logged.
// Calling credit-usage costs 0 Firecrawl credits (measured in the Slice 1 spike).

import { withSupabase } from "npm:@supabase/server@1.9.2";
import {
  type CreditsMeter,
  type CreditsResponse,
  FIRECRAWL_CREDIT_USAGE_URL,
  isFresh,
  parseCachedMeter,
  parseCreditUsage,
} from "./logic.ts";

const METER_KEY = "firecrawl";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "GET" && req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    // Team check, evaluated with the caller's JWT.
    const { data: isTeam, error: teamError } = await ctx.supabase.rpc("is_team");
    if (teamError || isTeam !== true) return json({ error: "not_team" }, 403);

    // Cached reading (usage_meters is read-only for users; the admin client writes it).
    const { data: cachedRow } = await ctx.supabaseAdmin
      .from("usage_meters")
      .select("value, updated_at")
      .eq("key", METER_KEY)
      .maybeSingle();
    const cached = cachedRow ? parseCachedMeter(cachedRow.value) : null;

    if (cached && isFresh(cachedRow?.updated_at, Date.now())) {
      return json({
        ...cached,
        updatedAt: cachedRow!.updated_at,
        stale: false,
      } satisfies CreditsResponse);
    }

    const key = Deno.env.get("FIRECRAWL_API_KEY");
    if (!key) return json({ error: "not_configured" }, 500);

    let meter: CreditsMeter | null = null;
    try {
      const res = await fetch(FIRECRAWL_CREDIT_USAGE_URL, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) meter = parseCreditUsage(await res.json());
      else console.error(`credits: Firecrawl HTTP ${res.status}`);
    } catch (err) {
      console.error(`credits: Firecrawl request failed (${(err as Error).name})`);
    }

    if (!meter) {
      // Firecrawl unavailable: fall back to the last reading if we have one.
      return cached
        ? json({
            ...cached,
            updatedAt: cachedRow!.updated_at,
            stale: true,
          } satisfies CreditsResponse)
        : json({ error: "firecrawl_unavailable" }, 502);
    }

    const updatedAt = new Date().toISOString();
    const { error: saveError } = await ctx.supabaseAdmin
      .from("usage_meters")
      .upsert({ key: METER_KEY, value: meter, updated_at: updatedAt });
    if (saveError) console.error(`credits: cache write failed (${saveError.code ?? "unknown"})`);

    return json({ ...meter, updatedAt, stale: false } satisfies CreditsResponse);
  }),
};
