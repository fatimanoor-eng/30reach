// `suggest-competitors` Edge Function: Add client, Slice 17d (15c checklist → 15d Competitors). Team only.
//
// POST { name, website, industry, country, queries: string[], scope: "local" | "national" }
//   200 { suggestions: [{ name, website, domain, about }], credits, searched: string[] }
//   400 { error: "bad_input" } · 409 { error: "low_credits", remaining } (< 8 left)
//   429 { error: "rate_limited", retryAfter } · 502 { error: "credits_unavailable" | "search_failed" }
//
// 2 searches (10 results each, 2 credits each) → Groq sorts them (competitor / listicle / marketplace /
// forum / news). National brands: the first listicle is read (1 credit) and Groq lists the brands it
// recommends. De-duplicated by domain; never the client's own site; Yelp / Reddit / marketplaces / news
// dropped. At most 6 suggestions: a person ticks the ones to track (never added automatically).

import {
  cleanResults,
  domainOf,
  LISTICLE_SCHEMA,
  listicleBrands,
  listicleSystem,
  listicleUser,
  pageText,
  pickCompetitors,
  SORT_SCHEMA,
  sortSystem,
  sortUser,
  type Suggestion,
} from "../_shared/site-logic.ts";
import { groqJson } from "../_shared/ai-server.ts";
import { isUuid } from "../_shared/ai-logic.ts";
import {
  fetchCreditUsage,
  FirecrawlRateLimited,
  json,
  readJson,
  recordUsage,
  requireTeam,
  saveCreditsCache,
  scrapeSite,
  searchWeb,
  withSupabase,
} from "../_shared/server.ts";

const MAX = 6;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const body = await readJson(req);
    const name = str(body.name, 80);
    const industry = str(body.industry, 80);
    const country = /^[A-Z]{2}$/.test(str(body.country, 2)) ? str(body.country, 2) : "US";
    const clientDomain = domainOf(str(body.website, 200));
    const national = body.scope === "national";
    let queries = (Array.isArray(body.queries) ? body.queries : [])
      .map((q) => str(q, 120))
      .filter(Boolean)
      .slice(0, 2);
    if (!name) return json({ error: "bad_input" }, 400);
    if (queries.length === 0) queries = [[industry || name, "brands"].join(" ")];

    const admin = ctx.supabaseAdmin;
    const actor = ctx.userClaims?.sub ?? null;
    const scanId = isUuid(body.scanId) ? body.scanId : null; // Slice 17f: claimed by the new client
    const credits = await fetchCreditUsage();
    if (!credits) return json({ error: "credits_unavailable" }, 502);
    await saveCreditsCache(admin, credits);
    if (credits.remaining < 8)
      return json({ error: "low_credits", remaining: credits.remaining }, 409);

    let spent = 0;
    let found;
    try {
      found = await Promise.all(queries.map((q) => searchWeb(q, { limit: 10, country })));
    } catch (e) {
      if (e instanceof FirecrawlRateLimited) {
        return json({ error: "rate_limited", retryAfter: e.retryAfter ?? 30 }, 429);
      }
      throw e;
    }
    const ok = found.filter((r) => r !== null);
    spent += ok.length * 2;
    await recordUsage(admin, {
      kind: "competitor_search",
      credits: spent,
      requests: ok.length,
      fn: "suggest-competitors",
      refId: scanId,
      actor,
    });
    if (ok.length === 0) return json({ error: "search_failed" }, 502);

    const results = cleanResults(
      ok.flat().sort((a, b) => a.position - b.position),
      clientDomain,
    ).slice(0, 18);
    const sorted = await groqJson({
      admin,
      fn: "suggest-competitors",
      actor,
      system: sortSystem(),
      user: sortUser({ name, industry, country }, results),
      schema: SORT_SCHEMA,
      maxTokens: 2000,
      validate: (raw) => (raw && typeof raw === "object" ? raw : null),
    });
    const picked = sorted.ok
      ? pickCompetitors(results, sorted.value)
      : {
          // Groq down: unblocked results in search order are still a useful start.
          suggestions: results
            .filter((r) => !r.blocked)
            .map((r): Suggestion => ({
              name:
                r.title
                  .split(/[|–—-]/)[0]
                  .trim()
                  .slice(0, 60) || r.domain,
              website: `https://${r.domain}`,
              domain: r.domain,
              about: "",
            })),
          listicle: null,
        };

    let suggestions = picked.suggestions;
    // National brands: search is noisy, listicles name the real competitors (spike, 24 Nov).
    if (national && picked.listicle && suggestions.length < MAX) {
      const page = await scrapeSite(picked.listicle, { branding: false, markdown: true }).catch(
        () => null,
      );
      if (page) {
        spent += page.credits;
        await recordUsage(admin, {
          kind: "competitor_search",
          credits: page.credits,
          fn: "suggest-competitors",
          refId: scanId,
          actor,
        });
        const brands = await groqJson({
          admin,
          fn: "suggest-competitors",
          label: "suggest-competitors listicle",
          actor,
          system: listicleSystem(),
          user: listicleUser(name, pageText(page.markdown, 7000)),
          schema: LISTICLE_SCHEMA,
          maxTokens: 1500,
          validate: (raw) => (raw && typeof raw === "object" ? raw : null),
        });
        if (brands.ok) {
          suggestions = [
            ...suggestions,
            ...listicleBrands(
              brands.value,
              new Set(suggestions.map((s) => s.domain)),
              clientDomain,
            ),
          ];
        }
      }
    }

    return json({ suggestions: suggestions.slice(0, MAX), credits: spent, searched: queries });
  }),
};
