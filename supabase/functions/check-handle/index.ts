// `check-handle` Edge Function — is this Instagram / TikTok handle or LinkedIn company page real and
// public? (Slice 8, 07b; LinkedIn Slice 15a)
//
// POST { platform: "instagram" | "tiktok" | "linkedin", handle } →   (LinkedIn: page URL or slug)
//   200 { status: "ok" | "not_found", handle, creditsUsed, credits }   (credits = fresh meter or null;
//       LinkedIn `handle` = the canonical https://www.linkedin.com/company/<slug>/)
//   400 { error: "bad_platform" | "bad_handle" }
//   402 { error: "insufficient", remaining }       balance can't cover one check (2 credits)
//   409 { error: "pull_running" }                   a pull is running (avoid rate-limit clashes)
//   429 { error: "rate_limited", retryAfter }        Firecrawl asked us to slow down (not charged)
//   502 { error: "firecrawl_unavailable" | <provider code> }
//
// Who can call it: signed-in team members only (same three locks as `credits`):
//   verify_jwt = true (config.toml) → withSupabase({ auth: "user" }) → is_team() as the caller.
// Cost: one first-page posts call. A handle that doesn't exist costs 0 credits, one that exists costs 2
// (Slice 1 spike); a LinkedIn page costs 1–2, a missing one 0 (HarvestAPI says invalid_option, which
// parsePage turns into not_found — the page URL was validated first). The posts that come back are NOT saved — this only checks. It never writes the
// competitor row either: the browser saves the result (team has full access to `competitors` via RLS).
// The Firecrawl key comes from the FIRECRAWL_API_KEY secret and is never returned or logged.

import {
  FirecrawlHttpError,
  FirecrawlRateLimited,
  fetchCreditUsage,
  json,
  readJson,
  requireTeam,
  saveCreditsCache,
  scrapePage,
  withSupabase,
} from "../_shared/server.ts";
import { parsePage } from "../_shared/pull-logic.ts";
import { CHECK_COST, checkOutcome, parseCheckRequest } from "./logic.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const parsed = parseCheckRequest(await readJson(req));
    if ("error" in parsed) return json(parsed, 400);
    const { platform, handle } = parsed;
    const admin = ctx.supabaseAdmin;

    // A running pull is already calling Firecrawl one page at a time; don't race it (free-plan 429s).
    const { data: running } = await admin
      .from("pulls")
      .select("id")
      .eq("status", "running")
      .limit(1)
      .maybeSingle();
    if (running) return json({ error: "pull_running" }, 409);

    // Live balance (0 credits). If Firecrawl can't tell us, carry on: the check itself will fail loudly.
    const before = await fetchCreditUsage();
    if (before && before.remaining < CHECK_COST) {
      return json({ error: "insufficient", remaining: before.remaining }, 402);
    }

    let body: unknown;
    try {
      body = await scrapePage(platform, handle, null);
    } catch (err) {
      if (err instanceof FirecrawlRateLimited) {
        console.error(
          `check-handle: Firecrawl rate limited (retry-after ${err.retryAfter ?? "none"})`,
        );
        return json({ error: "rate_limited", retryAfter: err.retryAfter }, 429);
      }
      const status = err instanceof FirecrawlHttpError ? err.status : 0;
      console.error(`check-handle: Firecrawl failed (${status || (err as Error).name})`);
      return json({ error: "firecrawl_unavailable", upstream: status || null }, 502);
    }

    const outcome = checkOutcome(parsePage(platform, body, 0));

    // Refresh the sidebar meter cache (0 credits) so the 2 credits show up straight away.
    const after = await fetchCreditUsage();
    if (after) await saveCreditsCache(admin, after);
    const credits = after ? { remaining: after.remaining, plan: after.plan } : null;

    if ("error" in outcome) {
      console.error(`check-handle: provider error ${outcome.error}`);
      return json({ error: outcome.error, creditsUsed: outcome.creditsUsed, credits }, 502);
    }
    return json({ status: outcome.status, handle, creditsUsed: outcome.creditsUsed, credits });
  }),
};
