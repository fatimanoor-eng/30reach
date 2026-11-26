// Slice 17d: Add client from a website. Calls scan-site / suggest-competitors and creates the client.
import { callFunction } from "../../../lib/pulls/api";
import { slugify, uniqueSlug } from "../../../lib/client-rules";
import { supabase } from "../../../lib/supabase";
import type { FoundAccount, SiteScan, Suggestion } from "./add-client-rules";

export type ScanFailure =
  | { kind: "unreadable"; credits: number; reason: "no_answer" | "error_page" }
  | { kind: "low_credits"; remaining: number }
  | { kind: "rate_limited"; retryAfter: number }
  | { kind: "failed" };

/** 15b → 15c: the client's own site (1 credit; 0 when it doesn't answer). */
export async function scanSite(url: string, scanId: string): Promise<SiteScan | ScanFailure> {
  const res = await callFunction<
    SiteScan | { status: "unreadable"; credits: number; reason: "no_answer" | "error_page" }
  >("scan-site", { url, mode: "client", scanId });
  if (res.ok) {
    return res.data.status === "ok"
      ? res.data
      : { kind: "unreadable", credits: res.data.credits, reason: res.data.reason };
  }
  return failure(res.status, res.data);
}

type PageRead = {
  /** The brand's name as its site gives it. */
  name: string;
  accounts: FoundAccount[] | null;
  credits: number;
  logoPath: string | null;
  logoUrl: string | null;
};

/** A competitor's home page → the accounts it links and a square logo (1 credit). Null when unreadable. */
export async function readAccounts(
  scanId: string,
  url: string,
  /** The competitor's name: the page's accounts are kept only if the page is really theirs (27 Nov). */
  brand?: string,
): Promise<PageRead | ScanFailure> {
  const res = await callFunction<{
    status: "ok" | "unreadable";
    credits: number;
    name?: string;
    accounts?: FoundAccount[];
    logoPath?: string | null;
    logoUrl?: string | null;
  }>("scan-site", { url, mode: "accounts", scanId, ...(brand ? { brand } : {}) });
  if (res.ok)
    return {
      name: res.data.name ?? "",
      accounts: res.data.status === "ok" ? (res.data.accounts ?? []) : null,
      credits: res.data.credits,
      logoPath: res.data.logoPath ?? null,
      logoUrl: res.data.logoUrl ?? null,
    };
  return failure(res.status, res.data);
}

/**
 * Smart add by hand (Discovery 2.0): a brand name → its own site (one search, 2 credits) → accounts +
 * logo (1). `null` = no site found (the credits were still spent).
 */
export async function findCompetitor(
  scanId: string,
  name: string,
): Promise<
  | (PageRead & { name: string; website: string; about: string })
  | { notFound: true; credits: number }
  | ScanFailure
> {
  const res = await callFunction<{
    status: "ok" | "unreadable" | "not_found";
    credits: number;
    name?: string;
    website?: string;
    about?: string;
    accounts?: FoundAccount[];
    logoPath?: string | null;
    logoUrl?: string | null;
  }>("scan-site", { name, mode: "find", scanId });
  if (!res.ok) return failure(res.status, res.data);
  if (res.data.status !== "ok" || !res.data.website)
    return { notFound: true, credits: res.data.credits };
  return {
    name: res.data.name ?? name,
    website: res.data.website,
    about: res.data.about ?? "",
    accounts: res.data.accounts ?? [],
    credits: res.data.credits,
    logoPath: res.data.logoPath ?? null,
    logoUrl: res.data.logoUrl ?? null,
  };
}

/**
 * Discovery 2.0: product + category searches, the second hop, maybe a list page, and one follower
 * search → closest rivals (≤ 10) and Big in your space (≤ 4), accounts not read yet.
 */
export async function suggestCompetitors(
  scanId: string,
  scan: SiteScan,
): Promise<{ suggestions: Suggestion[]; big: Suggestion[]; credits: number } | ScanFailure> {
  const res = await callFunction<{
    suggestions: Omit<Suggestion, "accounts">[];
    big?: Omit<Suggestion, "accounts">[];
    credits: number;
  }>("suggest-competitors", {
    name: scan.name,
    website: scan.website,
    industry: scan.industry,
    description: scan.description,
    country: scan.country,
    queries: scan.queries,
    scope: scan.scope,
    scanId,
  });
  if (res.ok) {
    return {
      suggestions: res.data.suggestions.map((s) => ({ ...s, group: "rival", accounts: null })),
      big: (res.data.big ?? []).map((s) => ({ ...s, group: "big", accounts: null })),
      credits: res.data.credits,
    };
  }
  return failure(res.status, res.data);
}

function failure(status: number, data: Record<string, unknown> | null): ScanFailure {
  if (status === 409 && data?.error === "low_credits")
    return { kind: "low_credits", remaining: Number(data.remaining) || 0 };
  if (status === 429) return { kind: "rate_limited", retryAfter: Number(data?.retryAfter) || 30 };
  return { kind: "failed" };
}

export const isFailure = (v: unknown): v is ScanFailure =>
  !!v && typeof v === "object" && "kind" in v && typeof (v as { kind: unknown }).kind === "string";

export type CreateInput = {
  client: {
    name: string;
    short_name: string | null;
    aliases: string[];
    initials: string;
    website: string;
    description: string | null;
    industry: string | null;
    audience: string | null;
    country: string;
    language: string;
    brand_color: string | null;
    logo_path: string | null;
    regulated: string[];
    audience_is_kids: boolean;
    health_months: boolean;
    content_rules: unknown[];
  };
  platforms: {
    platform: string;
    state: "on" | "off";
    source: "website" | "team";
    account_handle: string | null;
    account_url: string | null;
  }[];
  competitors: {
    name: string;
    short_name: string | null;
    initials: string;
    logo_path: string | null;
    logo_source: "site" | null;
    instagram_handle: string | null;
    tiktok_handle: string | null;
    linkedin_url: string | null;
    facebook_url: string | null;
    x_handle: string | null;
    youtube_handle: string | null;
  }[];
};

/**
 * Create client (15d): the client (slug from the name, "-2" if taken), its platforms and the ticked
 * competitors. If a later step fails the client is removed again, so nothing half-made is left.
 */
export async function createScannedClient(
  input: CreateInput,
  userId: string | null,
  scanId?: string,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: taken, error: slugError } = await supabase.from("clients").select("slug");
    if (slugError) throw slugError;
    const slug = uniqueSlug(
      slugify(input.client.name),
      ((taken ?? []) as { slug: string }[]).map((c) => c.slug),
    );
    const { data, error } = await supabase
      .from("clients")
      .insert({
        ...input.client,
        slug,
        created_by: userId,
        profile_scanned_at: new Date().toISOString(),
      })
      .select("id, slug, name")
      .single();
    if (error?.code === "23505") continue;
    if (error || !data) throw error ?? new Error("insert_failed");
    const client = data as { id: string; slug: string; name: string };
    const undo = async (e: unknown) => {
      await supabase.from("clients").delete().eq("id", client.id);
      throw e;
    };
    if (input.platforms.length) {
      const { error: pe } = await supabase
        .from("client_platforms")
        .insert(input.platforms.map((p) => ({ ...p, client_id: client.id })));
      if (pe) await undo(pe);
    }
    if (input.competitors.length) {
      const { error: ce } = await supabase
        .from("competitors")
        .insert(input.competitors.map((c) => ({ ...c, client_id: client.id })));
      if (ce) await undo(ce);
    }
    // The scan's credits (spent before the client existed) now count for it on the Usage page.
    if (scanId) await supabase.rpc("claim_scan_usage", { p_scan: scanId, p_client: client.id });
    return client;
  }
  throw new Error("slug_taken");
}
