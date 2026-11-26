// `suggest-competitors` Edge Function: Add client (Slice 17d; Discovery 2.0, 25 Nov 2026). Team only.
//
// POST { name, website, industry, description, country, queries: string[], scope: "local" | "national", scanId }
//   200 { suggestions: Found[] (closest rivals, ≤ 10), big: Found[] ("Big in your space", ≤ 4, with
//         approximate Instagram followers), credits, searched: string[] }
//   400 { error: "bad_input" } · 409 { error: "low_credits", remaining } (< 14 left)
//   429 { error: "rate_limited", retryAfter } · 502 { error: "credits_unavailable" | "search_failed" }
//
// Searches (2 credits per 10 results; spike 25 Nov, INTEGRATIONS › Discovery 2.0):
//   1. queries[0]: the PRODUCT search (what it does, in plain words) → the closest rivals' own sites.
//   2. queries[1]: the CATEGORY search (lists; local: category + city) → big names, more rivals.
//   Groq sorts the results (rival / big, with a why) and proposes brands it knows; a proposal is kept
//   only when a search result names it.
//   3. National brands: the SECOND HOP, "{top rival} alternatives" → Semrush / Similarweb snippets name
//      competing domains; Groq names them (free).
//   4. Fewer than 8 rivals: the first list article is read (1 credit) and Groq lists its brands.
//   5. Big in your space: ONE search of their Instagram profiles reads approximate followers.
// National ≈ 8–9 credits here, local ≈ 6. A person ticks the ones to track (never added automatically).

import {
  assembleDiscovery,
  corpusOf,
  DISCOVER_SCHEMA,
  discoverSystem,
  discoverUser,
  followerQuery,
  followersFromSnippets,
  hopDomains,
  HOP_SCHEMA,
  hopSystem,
  hopUser,
  LIST_PAGE_BELOW,
  MAX_RIVALS,
} from "../_shared/discovery-logic.ts";
import {
  cleanResults,
  domainOf,
  isNotCompetitor,
  LISTICLE_SCHEMA,
  listicleBrands,
  listicleSystem,
  listicleUser,
  pageText,
  type SearchResult,
} from "../_shared/site-logic.ts";
import { groqJson } from "../_shared/ai-server.ts";
import { isUuid } from "../_shared/ai-logic.ts";
import {
  userIdOf,
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

/** What this function can spend in the worst case (4 searches + 1 page), plus a margin. */
const FLOOR = 14;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const asObject = (raw: unknown) => (raw && typeof raw === "object" ? raw : null);

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const body = await readJson(req);
    const name = str(body.name, 80);
    const industry = str(body.industry, 80);
    const description = str(body.description, 400);
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
    const actor = userIdOf(ctx);
    const scanId = isUuid(body.scanId) ? body.scanId : null; // Slice 17f: claimed by the new client
    const credits = await fetchCreditUsage();
    if (!credits) return json({ error: "credits_unavailable" }, 502);
    await saveCreditsCache(admin, credits);
    if (credits.remaining < FLOOR)
      return json({ error: "low_credits", remaining: credits.remaining }, 409);

    let spent = 0;
    const searched: string[] = [];
    const log = (n: number, requests = 1) =>
      recordUsage(admin, {
        kind: "competitor_search",
        credits: n,
        requests,
        fn: "suggest-competitors",
        refId: scanId,
        actor,
      });
    /** One search (2 credits when it answers). Null when it fails; rate limits go up to the caller. */
    async function search(q: string): Promise<SearchResult[] | null> {
      const r = await searchWeb(q, { limit: 10, country });
      searched.push(q);
      if (r) {
        spent += 2;
        await log(2);
      }
      return r;
    }

    try {
      // 1–2. Product + category searches.
      const found = await Promise.all(queries.map(search));
      const ok = found.filter((r): r is SearchResult[] => r !== null);
      if (ok.length === 0) return json({ error: "search_failed" }, 502);
      const raw = ok.flat();
      const results = cleanResults(raw, clientDomain).slice(0, 20);
      const client = { name, domain: clientDomain, description, industry, country };

      const sorted = await groqJson({
        admin,
        fn: "suggest-competitors",
        actor,
        system: discoverSystem(),
        user: discoverUser(client, results),
        schema: DISCOVER_SCHEMA,
        maxTokens: 3000,
        validate: asObject,
      });
      const sort = sorted.ok ? sorted.value : null;
      const extra: string[] = [];
      type Hop = Parameters<typeof assembleDiscovery>[0]["hop"];
      type ListBrand = { name: string; domain: string; about: string };
      const pass = (hop: Hop, listBrands: ListBrand[] = []) =>
        assembleDiscovery({
          results,
          // Groq down: unblocked results in search order are still a useful start.
          sort: sort ?? {
            results: results.map((_, i) => ({ i, kind: "competitor", group: "rival" })),
          },
          hop,
          proposals: sort,
          listBrands,
          clientDomain,
          corpus: corpusOf(raw, extra),
          isBlocked: isNotCompetitor,
        });
      let picked = pass(null);

      // 3. Second hop (national): the top rival's competitors, named by Semrush / Similarweb.
      let hop: Hop = null;
      const top = picked.rivals[0];
      if (national && top) {
        const hopRaw = await search(`${top.name} alternatives`);
        if (hopRaw) {
          extra.push(corpusOf(hopRaw));
          const known = new Set([
            ...(clientDomain ? [clientDomain] : []),
            ...results.map((r) => r.domain),
            ...picked.rivals.map((r) => r.domain),
            ...picked.big.map((r) => r.domain),
          ]);
          const domains = hopDomains(cleanResults(hopRaw, clientDomain), known, isNotCompetitor);
          if (domains.length) {
            const names = await groqJson({
              admin,
              fn: "suggest-competitors",
              label: "suggest-competitors hop",
              actor,
              system: hopSystem(),
              user: hopUser({ name, description }, domains.slice(0, 12)),
              schema: HOP_SCHEMA,
              maxTokens: 1200,
              validate: asObject,
            });
            hop = { rival: top.name, domains, names: names.ok ? names.value : null };
            picked = pass(hop);
          }
        }
      }

      // 4. Still short: read the first list article (1 credit).
      const listicle = sort
        ? results.find((r, i) =>
            ((sort as { results?: { i: number; kind: string }[] }).results ?? []).some(
              (x) => Number(x.i) === i && x.kind === "listicle",
            ),
          )
        : undefined;
      if (picked.rivals.length < LIST_PAGE_BELOW && listicle) {
        const page = await scrapeSite(listicle.url, { branding: false, markdown: true }).catch(
          () => null,
        );
        if (page) {
          spent += page.credits;
          await log(page.credits);
          const text = pageText(page.markdown, 7000);
          extra.push(text.toLowerCase());
          const brands = await groqJson({
            admin,
            fn: "suggest-competitors",
            label: "suggest-competitors listicle",
            actor,
            system: listicleSystem(),
            user: listicleUser(name, text),
            schema: LISTICLE_SCHEMA,
            maxTokens: 1500,
            validate: asObject,
          });
          if (brands.ok) {
            const listBrands = listicleBrands(brands.value, new Set(), clientDomain).map((b) => ({
              name: b.name,
              domain: b.domain,
              about: b.about,
            }));
            picked = pass(hop, listBrands);
          }
        }
      }

      // 5. Big in your space: approximate followers from one Instagram snippet search.
      let big = picked.big;
      const q = followerQuery(big);
      if (q) {
        const snippets = await search(q);
        if (snippets) {
          const counts = followersFromSnippets(snippets, big);
          big = big.map((b) => ({ ...b, followers: counts.get(b.domain) ?? null }));
        }
      }

      return json({
        suggestions: picked.rivals.slice(0, MAX_RIVALS),
        big,
        credits: spent,
        searched,
      });
    } catch (e) {
      if (e instanceof FirecrawlRateLimited) {
        return json({ error: "rate_limited", retryAfter: e.retryAfter ?? 30, credits: spent }, 429);
      }
      throw e;
    }
  }),
};
