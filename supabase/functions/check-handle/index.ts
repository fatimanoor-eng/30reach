// `check-handle` Edge Function — is this Instagram / TikTok handle, LinkedIn company page or Facebook
// page real and public? (Slice 8, 07b; LinkedIn Slice 15a; Facebook Slice 16a; YouTube Slice 18)
//
// YouTube: one channels.list call to the official Data API (0 credits, 1 of the free daily quota units):
// `handle` = the @handle (no "@") or a UC… channel id; the answer adds `channelId` and `followers`
// (subscribers, rounded by YouTube). A handle that doesn't exist answers 200 with no items → not_found.
//
// POST { platform: "instagram" | "tiktok" | "linkedin" | "facebook", handle, clientId? } →   (LinkedIn / Facebook:
//       page URL or slug)
//   200 { status: "ok" | "not_found", handle, creditsUsed, credits, followers }   (credits = fresh meter
//       or null; LinkedIn `handle` = https://www.linkedin.com/company/<slug>/, Facebook `handle` =
//       https://www.facebook.com/<slug>; `followers` = the count the check saw, or null)
//   400 { error: "bad_platform" | "bad_handle" }
//   402 { error: "insufficient", remaining }       balance can't cover one check (2; Facebook 5)
//   409 { error: "pull_running" }                   a pull is running (avoid rate-limit clashes)
//   429 { error: "rate_limited", retryAfter }        Firecrawl asked us to slow down (not charged)
//   502 { error: "firecrawl_unavailable" | <provider code> }
//
// Who can call it: signed-in team members only (same three locks as `credits`):
//   verify_jwt = true (config.toml) → withSupabase({ auth: "user" }) → is_team() as the caller.
// Cost: one first-page posts call. A handle that doesn't exist costs 0 credits, one that exists costs 2
// (Slice 1 spike); a LinkedIn page costs 1–2, a missing one 0 (HarvestAPI says invalid_option, which
// parsePage turns into not_found — the page URL was validated first). Facebook is one AnyAPI
// facebook/profile call instead (5 credits for a page that exists, 0 for one that doesn't): it checks the
// page AND reads its followers, which the pulls don't get. The posts that come back are NOT saved — this only checks. It never writes the
// competitor row either: the browser saves the result (team has full access to `competitors` via RLS).
// The Firecrawl key comes from the FIRECRAWL_API_KEY secret and is never returned or logged.

import {
  FirecrawlHttpError,
  FirecrawlRateLimited,
  fetchCreditUsage,
  json,
  readJson,
  recordUsage,
  clientName,
  requireTeam,
  saveCreditsCache,
  fetchYouTubeChannel,
  scrapeFacebookProfile,
  scrapeXUserPosts,
  scrapePage,
  withSupabase,
  YouTubeApiError,
} from "../_shared/server.ts";
import { parseChannel } from "../_shared/youtube-logic.ts";
import { parseFacebookProfile, parsePage, parseXUserPosts } from "../_shared/pull-logic.ts";
import {
  CHECK_COST,
  channelOutcome,
  checkOutcome,
  parseCheckRequest,
  profileOutcome,
} from "./logic.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const input = await readJson(req);
    const parsed = parseCheckRequest(input);
    // Optional (Slice 17a): which client the check is for, so its credits show on that client's Usage row.
    const clientId = typeof input.clientId === "string" ? input.clientId : null;
    if ("error" in parsed) return json(parsed, 400);
    const { platform, handle } = parsed;
    const admin = ctx.supabaseAdmin;

    // YouTube (18): the official API, no Firecrawl credits, so no balance check and no clash with a pull.
    if (platform === "youtube") {
      let outcome: ReturnType<typeof channelOutcome>;
      try {
        outcome = channelOutcome(parseChannel(await fetchYouTubeChannel(handle)));
      } catch (err) {
        const code = err instanceof YouTubeApiError ? err.code : "youtube_unavailable";
        console.error(`check-handle: YouTube API failed (${code})`);
        return json({ error: code, creditsUsed: 0, credits: null }, 502);
      }
      if ("error" in outcome) return json({ ...outcome, credits: null }, 502);
      return json({
        status: outcome.status,
        handle,
        creditsUsed: 0,
        credits: null,
        followers: outcome.status === "ok" ? outcome.followers : null,
        channelId: "channelId" in outcome ? (outcome.channelId ?? null) : null,
      });
    }

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
    if (before && before.remaining < CHECK_COST[platform]) {
      return json({ error: "insufficient", remaining: before.remaining }, 402);
    }

    let body: unknown;
    try {
      body =
        platform === "facebook"
          ? await scrapeFacebookProfile(handle)
          : platform === "x"
            ? await scrapeXUserPosts(handle)
            : await scrapePage(platform, handle, null);
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

    const outcome =
      platform === "facebook"
        ? profileOutcome(parseFacebookProfile(body))
        : platform === "x"
          ? profileOutcome(parseXUserPosts(body))
          : checkOutcome(parsePage(platform, body, 0));

    await recordUsage(admin, {
      kind: "handle_check",
      clientId,
      clientName: await clientName(admin, clientId),
      credits: outcome.creditsUsed,
      fn: "check-handle",
      actor: ctx.userClaims?.sub ?? null,
    });

    // Refresh the sidebar meter cache (0 credits) so the spend shows up straight away.
    const after = await fetchCreditUsage();
    if (after) await saveCreditsCache(admin, after);
    const credits = after ? { remaining: after.remaining, plan: after.plan } : null;

    if ("error" in outcome) {
      console.error(`check-handle: provider error ${outcome.error}`);
      return json({ error: outcome.error, creditsUsed: outcome.creditsUsed, credits }, 502);
    }
    return json({
      status: outcome.status,
      handle,
      creditsUsed: outcome.creditsUsed,
      credits,
      followers: outcome.status === "ok" ? outcome.followers : null,
    });
  }),
};
