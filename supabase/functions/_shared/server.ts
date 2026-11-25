// Shared Edge Function helpers (Deno). Auth model = the `credits` function:
// verify_jwt = true (config.toml) + withSupabase({ auth: "user" }) + is_team() called as the caller.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  type CreditsMeter,
  FIRECRAWL_CREDIT_USAGE_URL,
  parseCreditUsage,
} from "../credits/logic.ts";
import { decodeLinkedInCursor, parseRetryAfter, type Platform } from "./pull-logic.ts";

import { type UsageInput, usageRow } from "./usage.ts";

export { withSupabase } from "npm:@supabase/server@1.9.2";
export type { SupabaseClient };

export const json = (body: unknown, status = 200) => Response.json(body, { status });

type RpcClient = { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> };

/** 403 unless the caller is a team member (same rule as RLS). */
export async function requireTeam(ctx: { supabase: RpcClient }): Promise<Response | null> {
  const { data, error } = await ctx.supabase.rpc("is_team");
  return error || data !== true ? json({ error: "not_team" }, 403) : null;
}

/** Admins only (is_admin(): team, not removed, role admin). 403 { error: "not_admin" } otherwise. */
export async function requireAdmin(ctx: { supabase: RpcClient }): Promise<Response | null> {
  const { data, error } = await ctx.supabase.rpc("is_admin");
  return error || data !== true ? json({ error: "not_admin" }, 403) : null;
}

/** Remove post-thumbs/{client}/{pull}/* (Storage doesn't cascade with the rows). */
export async function deleteThumbnails(admin: SupabaseClient, clientId: string, pullId: string) {
  const folder = `${clientId}/${pullId}`;
  for (;;) {
    const { data, error } = await admin.storage.from("post-thumbs").list(folder, { limit: 1000 });
    if (error || !data || data.length === 0) return;
    const { error: removeError } = await admin.storage
      .from("post-thumbs")
      .remove(data.map((f) => `${folder}/${f.name}`));
    if (removeError || data.length < 1000) return;
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function firecrawlKey(): string {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  return key;
}

/** Live Firecrawl balance (0 credits). Null if Firecrawl can't be reached. Never logs the key. */
export async function fetchCreditUsage(): Promise<CreditsMeter | null> {
  try {
    const res = await fetch(FIRECRAWL_CREDIT_USAGE_URL, {
      headers: { Authorization: `Bearer ${firecrawlKey()}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`credit-usage: HTTP ${res.status}`);
      return null;
    }
    return parseCreditUsage(await res.json());
  } catch (err) {
    console.error(`credit-usage failed (${(err as Error).name})`);
    return null;
  }
}

/** Same cache the `credits` function reads (usage_meters['firecrawl']). */
export async function saveCreditsCache(admin: SupabaseClient, meter: CreditsMeter) {
  const { error } = await admin
    .from("usage_meters")
    .upsert({ key: "firecrawl", value: meter, updated_at: new Date().toISOString() });
  if (error) console.error(`usage_meters write failed (${error.code ?? "unknown"})`);
}

export class FirecrawlHttpError extends Error {
  constructor(public status: number) {
    super(`Firecrawl HTTP ${status}`);
  }
}

/** Firecrawl answered 429. `retryAfter` = seconds from its Retry-After header, if it sent one. */
export class FirecrawlRateLimited extends Error {
  constructor(public retryAfter: number | null) {
    super("Firecrawl rate limited (429)");
  }
}

/** Firecrawl Alexandria provider + capability + options for one page (INTEGRATIONS.md §2a + LinkedIn / Facebook spikes). */
function pageRequest(platform: Platform, target: string, cursor: string | null) {
  if (platform === "instagram")
    return {
      provider: "scrapecreators",
      capability: "instagram/user-posts",
      options: { handle: target, ...(cursor ? { next_max_id: cursor } : {}) },
    };
  if (platform === "tiktok")
    return {
      provider: "scrapecreators",
      capability: "tiktok/user-videos",
      options: {
        handle: target,
        sort_by: "latest",
        region: "US",
        ...(cursor ? { max_cursor: cursor } : {}),
      },
    };
  // X (17g): `target` is the whole search query (xQuery: every brand's handle, since:, no replies / reposts).
  if (platform === "x")
    return {
      provider: "anyapi",
      capability: "twitter/search",
      options: { query: target, queryType: "Latest", ...(cursor ? { cursor } : {}) },
    };
  if (platform === "facebook")
    return {
      provider: "scrapecreators",
      capability: "facebook/profile-posts",
      options: { url: target, ...(cursor ? { cursor } : {}) },
    };
  // LinkedIn: `target` is the company page URL; the cursor packs page + paginationToken.
  const { page, token } = decodeLinkedInCursor(cursor);
  return {
    provider: "harvestapi",
    capability: "linkedin/company-posts",
    options: {
      company: target,
      ...(page > 1 ? { page } : {}),
      ...(token ? { paginationToken: token } : {}),
    },
  };
}

/**
 * ONE page of posts via Firecrawl: ScrapeCreators for Instagram/TikTok (2 credits; 0 if not found) and
 * Facebook (1 credit, 3 posts; 0 if not found), HarvestAPI for LinkedIn (1–2 credits, also for an empty
 * page; 0 if the page doesn't exist).
 * `target` = the handle (Instagram/TikTok) or the page URL (LinkedIn company page, Facebook page).
 */
export function scrapePage(platform: Platform, target: string, cursor: string | null) {
  return alexandria(pageRequest(platform, target, cursor));
}

/**
 * A Facebook page's profile via AnyAPI (followers): 5 credits, 0 if the page doesn't exist (measured
 * 24 Nov). Used only by check-handle when a Facebook page is saved or changed, never by a pull.
 */
export function scrapeFacebookProfile(url: string) {
  return alexandria({ provider: "anyapi", capability: "facebook/profile", options: { url } });
}

/** X handle check (17g): ScrapeCreators x/user-posts, 1 credit (also for a missing account). */
export function scrapeXUserPosts(handle: string) {
  return alexandria({
    provider: "scrapecreators",
    capability: "x/user-posts",
    options: { handle, trim: true },
  });
}

/** One Alexandria call through Firecrawl /v2/scrape. 429 → FirecrawlRateLimited, other non-2xx → FirecrawlHttpError. */
async function alexandria(request: { provider: string; capability: string; options: unknown }) {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${firecrawlKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ alexandria: request }),
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 429) {
    await res.body?.cancel();
    throw new FirecrawlRateLimited(parseRetryAfter(res.headers.get("retry-after")));
  }
  if (!res.ok) throw new FirecrawlHttpError(res.status);
  return (await res.json()) as unknown;
}

export type SiteScrape = {
  markdown: string;
  links: string[];
  metadata: Record<string, unknown>;
  branding: Record<string, unknown> | null;
  /** What Firecrawl charged (1 for a page, also a 403 / 404 page that returns a document). */
  credits: number;
  /** The site's own HTTP status (an error page still costs a credit). */
  statusCode: number | null;
};

/**
 * One web page through Firecrawl /v2/scrape (Slice 17d, Add client): markdown + links (+ branding for the
 * client's own site). 1 credit; a site that never answers costs nothing and returns null.
 */
export async function scrapeSite(
  url: string,
  { branding, markdown = branding }: { branding: boolean; markdown?: boolean },
): Promise<SiteScrape | null> {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${firecrawlKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: [...(markdown ? ["markdown"] : []), "links", ...(branding ? ["branding"] : [])],
      onlyMainContent: false,
      timeout: 30_000,
    }),
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null);
  if (!res) return null;
  if (res.status === 429) {
    await res.body?.cancel();
    throw new FirecrawlRateLimited(parseRetryAfter(res.headers.get("retry-after")));
  }
  if (!res.ok) {
    await res.body?.cancel();
    return null; // timeout, bot wall, DNS: no document, not charged
  }
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: Record<string, unknown>;
  } | null;
  const d = body?.data;
  if (!body?.success || !d) return null;
  const meta = (d.metadata ?? {}) as Record<string, unknown>;
  const status = Number(meta.statusCode);
  return {
    markdown: typeof d.markdown === "string" ? d.markdown : "",
    links: Array.isArray(d.links)
      ? (d.links as unknown[]).filter((l): l is string => typeof l === "string")
      : [],
    metadata: meta,
    branding: (d.branding ?? null) as Record<string, unknown> | null,
    credits: Number(meta.creditsUsed) || 1,
    statusCode: Number.isFinite(status) ? status : null,
  };
}

/** Web search through Firecrawl /v2/search (2 credits per 10 results). Null when it fails. */
export async function searchWeb(
  query: string,
  { limit = 10, country }: { limit?: number; country?: string } = {},
): Promise<{ url: string; title: string; description: string; position: number }[] | null> {
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${firecrawlKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit, ...(country ? { country } : {}) }),
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null);
  if (!res) return null;
  if (res.status === 429) {
    await res.body?.cancel();
    throw new FirecrawlRateLimited(parseRetryAfter(res.headers.get("retry-after")));
  }
  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  const body = (await res.json().catch(() => null)) as { data?: { web?: unknown[] } } | null;
  const web = Array.isArray(body?.data?.web) ? body!.data!.web! : [];
  return web
    .map((r) => r as Record<string, unknown>)
    .filter((r) => typeof r.url === "string")
    .map((r, i) => ({
      url: r.url as string,
      title: typeof r.title === "string" ? r.title : "",
      description: typeof r.description === "string" ? r.description : "",
      position: typeof r.position === "number" ? r.position : i + 1,
    }));
}

/**
 * Record what a call cost (Slice 17a, `usage_events`). Never throws and never fails the request it is
 * recording: a missing usage row only makes the Usage page a little low, a failed pull would be worse.
 */
export async function recordUsage(admin: SupabaseClient, e: UsageInput): Promise<void> {
  const row = usageRow(e);
  if (!row) return;
  try {
    const { error } = await admin.from("usage_events").insert(row);
    if (error) console.error(`usage_events write failed (${error.code ?? "unknown"})`);
  } catch (err) {
    console.error(`usage_events write failed (${(err as Error).name})`);
  }
}

/** Client name for usage rows (kept when a client is later deleted). Null if it can't be read. */
export async function clientName(
  admin: SupabaseClient,
  clientId: string | null,
): Promise<string | null> {
  if (!clientId) return null;
  const { data } = await admin.from("clients").select("name").eq("id", clientId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}
