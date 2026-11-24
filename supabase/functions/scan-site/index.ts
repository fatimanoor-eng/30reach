// `scan-site` Edge Function: Add client, Slice 17d (15b → 15c, M14 → M15). Team only.
//
// POST { url, mode: "client" }   → the client's own site: page + links + branding (1 credit), then a Groq
//                                  profile (free). The logo is copied into client-logos/scans/… (≤ 200 KB).
//   200 { status: "ok", credits, website, name, description, country, language, industry, audience,
//         regulated[], audienceIsKids, healthMonths, rules[{id, rule, why, quote}], queries[], scope,
//         color, logoPath, logoUrl, accounts[{platform, handle, url}] }
//   200 { status: "unreadable", credits: 0 | 1, reason: "no_answer" | "error_page" }
// POST { url, mode: "accounts" } → a competitor's home page: its social accounts only (1 credit).
//   200 { status: "ok", credits, accounts[] } · 200 { status: "unreadable", credits, reason }
//   400 { error: "bad_url" } · 409 { error: "low_credits", remaining } (client: < 15 left; accounts: < 2)
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
    const url = siteUrl(body.url);
    if (!url) return json({ error: "bad_url" }, 400);
    const mode = body.mode === "accounts" ? "accounts" : "client";
    const admin = ctx.supabaseAdmin;
    const actor = ctx.userClaims?.sub ?? null;
    // One id per Add client run (Slice 17f): creating the client claims these usage rows.
    const scanId = isUuid(body.scanId) ? body.scanId : null;

    // Never start blind: the whole Add client run needs ~12 credits; one competitor page needs 1.
    const credits = await fetchCreditUsage();
    if (!credits) return json({ error: "credits_unavailable" }, 502);
    await saveCreditsCache(admin, credits);
    const floor = mode === "client" ? 15 : 2;
    if (credits.remaining < floor) {
      return json({ error: "low_credits", remaining: credits.remaining }, 409);
    }

    let page;
    try {
      page = await scrapeSite(url, { branding: mode === "client" });
    } catch (e) {
      if (e instanceof FirecrawlRateLimited) {
        return json({ error: "rate_limited", retryAfter: e.retryAfter ?? 30 }, 429);
      }
      throw e;
    }
    if (!page) return json({ status: "unreadable", credits: 0, reason: "no_answer" });

    await recordUsage(admin, {
      kind: mode === "client" ? "scan" : "competitor_search",
      credits: page.credits,
      fn: "scan-site",
      refId: scanId,
      actor,
    });
    if (page.statusCode && page.statusCode >= 400) {
      return json({ status: "unreadable", credits: page.credits, reason: "error_page" });
    }
    const accounts = accountsFromLinks(page.links);
    if (mode === "accounts") return json({ status: "ok", credits: page.credits, accounts });

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
      user: profileUser(url, text),
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
