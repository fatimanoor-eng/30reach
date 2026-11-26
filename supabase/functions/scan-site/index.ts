// `scan-site` Edge Function: Add client, Slice 17d (15b → 15c, M14 → M15). Team only.
//
// POST { url, mode: "client" }   → the client's own site: page + links + branding (1 credit), then a Groq
//                                  profile (free). The logo is copied into client-logos/scans/… (≤ 200 KB).
//   200 { status: "ok", credits, website, name, description, country, language, industry, audience,
//         regulated[], audienceIsKids, healthMonths, rules[{id, rule, why, quote}], queries[], scope,
//         color, logoPath, logoUrl, accounts[{platform, handle, url}] }
//   200 { status: "unreadable", credits: 0 | 1, reason: "no_answer" | "error_page" }
// POST { url, mode: "accounts" } → a competitor's home page: its social accounts and a 128 px square logo
//                                  (1 credit; Discovery 2.0: logo from the site's square logo or icon).
//   200 { status: "ok", credits, name, accounts[], logoPath, logoUrl } · 200 { status: "unreadable", credits, reason }
// POST { name, mode: "find" }     → smart add by hand (Discovery 2.0): "{name} official site" (2 credits) →
//                                  the brand's own site → its accounts + logo (1). ≈ 3 credits.
//   200 { status: "ok", credits, name, website, accounts[], logoPath, logoUrl } · { status: "not_found", credits }
//   400 { error: "bad_url" } · 409 { error: "low_credits", remaining } (client: < 20 left; accounts: < 2; find: < 4)
//   429 { error: "rate_limited", retryAfter } · 502 { error: "credits_unavailable" }
//
// Content rules must quote the page word for word (validateProfile drops the rest). Every credit is
// logged to usage_events (kind scan / competitor_search, client_id null until the client exists).

import {
  accountsFromLinks,
  brandColor,
  brandName,
  domainOf,
  PROFILE_SCHEMA,
  profileSystem,
  profileUser,
  sitePage,
  type SiteProfile,
  validateProfile,
} from "../_shared/site-logic.ts";
import { domainStem, looksLikeBrandSite, normName } from "../_shared/discovery-logic.ts";
// Never import logo-image.ts directly (26 Nov outage): logo-safe loads it lazily and cannot throw.
import { saveLogoSafely, signedLogoUrlSafely } from "../_shared/logo-safe.ts";
import { logoCandidates } from "../_shared/logo-logic.ts";
import { cleanResults, isNotCompetitor } from "../_shared/site-logic.ts";
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
  type SupabaseClient,
  withSupabase,
} from "../_shared/server.ts";

const LOGO_MAX = 200 * 1024;
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** https:// + host (no path) for a typed site; null when it isn't a web address. */
function siteUrl(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const host = domainOf(input.trim());
  return host && host.includes(".") ? `https://${host}` : null;
}

/** The brand's logo into client-logos/scans/<uuid>.<ext> (kept as delivered; ≤ 200 KB). Null if not. */
async function copyLogo(admin: SupabaseClient, url: string | null): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = LOGO_TYPES[type];
    if (!res.ok || !ext) {
      await res.body?.cancel();
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > LOGO_MAX) return null;
    const path = `scans/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage
      .from("client-logos")
      .upload(path, bytes, { contentType: type, upsert: false });
    return error ? null : path;
  } catch {
    return null;
  }
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const body = await readJson(req);
    const mode = body.mode === "accounts" ? "accounts" : body.mode === "find" ? "find" : "client";
    const findName = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    // Accounts mode (27 Nov): the competitor's name, to check the page is really theirs.
    const brand = typeof body.brand === "string" ? body.brand.trim().slice(0, 80) : findName;
    let url = siteUrl(body.url);
    if (mode === "find" ? !findName : !url) return json({ error: "bad_url" }, 400);
    const admin = ctx.supabaseAdmin;
    const actor = userIdOf(ctx);
    // One id per Add client run (Slice 17f): creating the client claims these usage rows.
    const scanId = isUuid(body.scanId) ? body.scanId : null;

    // Never start blind: the whole Add client run needs ~15–18 credits (Discovery 2.0, so 20 to start);
    // one competitor page needs 1; finding a brand by name about 3.
    const credits = await fetchCreditUsage();
    if (!credits) return json({ error: "credits_unavailable" }, 502);
    await saveCreditsCache(admin, credits);
    const floor = mode === "client" ? 20 : mode === "find" ? 4 : 2;
    if (credits.remaining < floor) {
      return json({ error: "low_credits", remaining: credits.remaining }, 409);
    }

    let spent = 0;
    let page;
    try {
      if (mode === "find") {
        // The brand's own site: the first result that isn't a marketplace / social / news page and whose
        // domain or title carries the name ("Worth a Penny" → worthepenny.com); else the first site at all.
        const q = `${findName} official site`;
        const found = await searchWeb(q, { limit: 5 });
        if (found) {
          spent += 2;
          await recordUsage(admin, {
            kind: "competitor_search",
            credits: 2,
            fn: "scan-site",
            refId: scanId,
            actor,
          });
        }
        const sites = cleanResults(found ?? [], null).filter(
          (r) => !r.blocked && !isNotCompetitor(r.domain),
        );
        const want = normName(findName).replace(/ /g, "");
        const hit =
          sites.find((r) => {
            const stem = domainStem(r.domain);
            return (
              stem.includes(want.slice(0, 6)) || normName(r.title).replace(/ /g, "").includes(want)
            );
          }) ?? sites[0];
        if (!hit) return json({ status: "not_found", credits: spent });
        url = `https://${hit.domain}`;
      }
      page = await scrapeSite(url!, { branding: true, markdown: mode === "client" });
    } catch (e) {
      if (e instanceof FirecrawlRateLimited) {
        return json({ error: "rate_limited", retryAfter: e.retryAfter ?? 30 }, 429);
      }
      throw e;
    }
    if (!page) return json({ status: "unreadable", credits: spent, reason: "no_answer" });

    spent += page.credits;
    await recordUsage(admin, {
      kind: mode === "client" ? "scan" : "competitor_search",
      credits: page.credits,
      fn: "scan-site",
      refId: scanId,
      actor,
    });
    if (page.statusCode && page.statusCode >= 400) {
      return json({ status: "unreadable", credits: spent, reason: "error_page" });
    }
    const accounts = accountsFromLinks(page.links);
    if (mode !== "client") {
      // Not the brand's own page (a document host, a directory: the FAST-NUCES / Scribd case): its accounts
      // and logo belong to someone else, so none are kept ("No accounts found · add" in Review).
      const site = domainOf(url!) ?? "";
      const handles = accounts.map(
        (a) => a.handle ?? (a.url ?? "").split("/").filter(Boolean).pop() ?? "",
      );
      if (!looksLikeBrandSite(site, handles, brand)) {
        return json({
          status: "ok",
          credits: spent,
          accounts: [],
          logoPath: null,
          logoUrl: null,
          name: brand,
          notBrandSite: true,
        });
      }
      // Competitor: a small square logo from the same page (branding has no surcharge; 0 extra credits).
      const logoPath = await saveLogoSafely(
        admin,
        logoCandidates(page.branding, page.metadata),
        `scans/c-${crypto.randomUUID()}.png`,
      );
      const meta = page.metadata;
      const title = typeof meta.title === "string" ? meta.title : "";
      return json({
        status: "ok",
        credits: spent,
        accounts,
        logoPath,
        logoUrl: await signedLogoUrlSafely(admin, logoPath),
        // The brand's name as its site gives it (a website typed in smart add has no name yet).
        name:
          mode === "find"
            ? findName
            : brandName({
                brandName:
                  typeof page.branding?.brandName === "string" ? page.branding.brandName : null,
                siteName: typeof meta.ogSiteName === "string" ? meta.ogSiteName : null,
                title,
              }),
        ...(mode === "find"
          ? {
              website: url,
              about: title
                .split(/\s[|–—-]\s/)
                .slice(1)
                .join(" ")
                .slice(0, 60),
            }
          : {}),
      });
    }

    const meta = page.metadata;
    const branding = page.branding ?? {};
    const s = (v: unknown) => (typeof v === "string" ? v : null);
    const fallbackName = brandName({
      brandName: s(branding.brandName),
      siteName: s(meta.ogSiteName) ?? s(meta["og:site_name"]),
      title: s(meta.title) ?? s(meta.ogTitle),
    });
    const text = sitePage({
      title: s(meta.title),
      description: s(meta.description),
      markdown: page.markdown,
    });

    const ai = await groqJson<SiteProfile>({
      admin,
      fn: "scan-site",
      actor,
      system: profileSystem(),
      user: profileUser(url!, text),
      schema: PROFILE_SCHEMA,
      maxTokens: 2500,
      validate: (raw) => validateProfile(raw, text, fallbackName),
    });
    // Groq down → the scan still helps: name, description and accounts from the page, rest by hand.
    const profile: SiteProfile = ai.ok
      ? ai.value
      : {
          name: fallbackName,
          description: s(meta.description)?.slice(0, 400) ?? "",
          country: "US",
          language: (s(meta.language) ?? "en").slice(0, 2).toLowerCase(),
          industry: "",
          audience: "",
          regulated: [],
          audienceIsKids: false,
          healthMonths: false,
          rules: [],
          queries: [],
          scope: "local",
          shortName: "",
          aliases: [],
        };
    if (!profile.description) profile.description = s(meta.description)?.slice(0, 400) ?? "";

    const images = (branding.images ?? {}) as Record<string, unknown>;
    const logoPath = await copyLogo(admin, s(branding.logo) ?? s(images.logo));
    const logoUrl = logoPath
      ? ((await admin.storage.from("client-logos").createSignedUrl(logoPath, 3600)).data
          ?.signedUrl ?? null)
      : null;

    return json({
      status: "ok",
      credits: page.credits,
      website: url,
      ...profile,
      color: brandColor((branding.colors ?? null) as Record<string, unknown> | null),
      logoPath,
      logoUrl,
      accounts,
      profileFromAi: ai.ok,
    });
  }),
};
