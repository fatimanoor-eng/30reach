// Slice 17d: Add client from a website. Pure rules for `scan-site` and `suggest-competitors` (tested in
// site-logic.test.ts with the 24 Nov spike pages). No network here.
import { facebookPageUrl, linkedInSlug } from "./pull-logic.ts";

/** Platforms 30reach pulls today (the rest are "found, coming later"). */
export const SUPPORTED = ["instagram", "tiktok", "linkedin", "facebook"] as const;
export const LATER = ["x", "youtube", "pinterest", "threads"] as const;
export type FoundPlatform = (typeof SUPPORTED)[number] | (typeof LATER)[number];

/** An account linked on a site: handle (Instagram / TikTok / X / YouTube / Pinterest / Threads) or page URL. */
export type FoundAccount = { platform: FoundPlatform; handle: string | null; url: string | null };

const HOSTS: [FoundPlatform, RegExp][] = [
  ["instagram", /(^|\.)instagram\.com$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["facebook", /(^|\.)(facebook\.com|fb\.com)$/],
  ["linkedin", /(^|\.)linkedin\.com$/],
  ["x", /(^|\.)(twitter\.com|x\.com)$/],
  ["youtube", /(^|\.)youtube\.com$/],
  ["pinterest", /(^|\.)pinterest\.[a-z.]+$/],
  ["threads", /(^|\.)threads\.(net|com)$/],
];

// First path segments that are never a profile.
const NOT_PROFILE: Record<string, RegExp> = {
  instagram: /^(p|reel|reels|tv|explore|stories|accounts|direct|about|legal|developer)$/i,
  tiktok: /^(video|tag|music|discover|foryou|legal|about|embed)$/i,
  x: /^(intent|share|search|hashtag|home|i|explore|settings|privacy|tos)$/i,
  pinterest: /^(pin|search|ideas|today|_)$/i,
  youtube: /^(watch|shorts|results|embed|playlist|feed|redirect)$/i,
  threads: /^(t|post|search)$/i,
};
const HANDLE = /^[A-Za-z0-9._-]{1,50}$/;

/** One link → the account it points at, or null (share links, posts, reels, groups, other sites). */
export function accountFromLink(raw: string): FoundAccount | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  const hit = HOSTS.find(([, re]) => re.test(host));
  if (!hit) return null;
  const platform = hit[0];
  if (/\/(share|sharer|intent|dialog|plugins)\b/i.test(u.pathname)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  if (!first) return null;

  if (platform === "facebook") {
    const page = facebookPageUrl(raw); // refuses groups / events / posts; maps /p/<name>-<id>
    return page ? { platform, handle: null, url: page } : null;
  }
  if (platform === "linkedin") {
    const slug = linkedInSlug(raw); // company pages only
    return slug
      ? { platform, handle: null, url: `https://www.linkedin.com/company/${slug}/` }
      : null;
  }
  if (NOT_PROFILE[platform]?.test(first)) return null;
  if (platform === "youtube") {
    if (first.startsWith("@") && HANDLE.test(first.slice(1)))
      return { platform, handle: first.slice(1).toLowerCase(), url: null };
    if ((first === "channel" || first === "c" || first === "user") && parts[1])
      return { platform, handle: null, url: `https://www.youtube.com/${first}/${parts[1]}` };
    return null;
  }
  const handle = first.replace(/^@/, "");
  if (platform === "tiktok" && !first.startsWith("@")) return null;
  if (!HANDLE.test(handle)) return null;
  return { platform, handle: handle.toLowerCase(), url: null };
}

/** Every social account on a page, one per platform (the first link wins: header / footer order). */
export function accountsFromLinks(links: readonly string[] | null | undefined): FoundAccount[] {
  const seen = new Map<FoundPlatform, FoundAccount>();
  for (const l of links ?? []) {
    const a = accountFromLink(l);
    if (a && !seen.has(a.platform)) seen.set(a.platform, a);
  }
  const order: FoundPlatform[] = [...SUPPORTED, ...LATER];
  return order.filter((p) => seen.has(p)).map((p) => seen.get(p)!);
}

/** "@shop_allthebest", "shop.at.atb" (Facebook page), "baskits-inc" — what the checklist and review show. */
export function accountLabel(a: FoundAccount): string {
  if (a.handle) return `@${a.handle}`;
  const url = a.url ?? "";
  const id = url.match(/[?&]id=(\d+)/);
  if (id) return `facebook.com/profile.php?id=${id[1]}`;
  return url
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/^(facebook\.com|linkedin\.com\/company)\//, "")
    .replace(/\/$/, "");
}

const tidy = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s,;:|·–—-]+|[\s,;:|·–—-]+$/g, "");

/**
 * The brand's name from the page: `branding.brandName` / og:site_name, tidied ("All the Best," → "All
 * the Best"), upgraded to the fuller title part when the title says it better ("… | All The Best Co").
 */
export function brandName(meta: {
  brandName?: string | null;
  siteName?: string | null;
  title?: string | null;
}): string {
  const base = tidy(meta.brandName) || tidy(meta.siteName);
  const parts = (meta.title ?? "")
    .split(/\s[|–—·-]\s|\s\|\s?/)
    .map(tidy)
    .filter(Boolean);
  if (base) {
    const fuller = parts.find(
      (p) =>
        p.toLowerCase().startsWith(base.toLowerCase()) && p.length > base.length && p.length <= 60,
    );
    return (fuller ?? base).slice(0, 80);
  }
  return (parts.at(-1) ?? parts[0] ?? "").slice(0, 80);
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Brand colour: the accent, else the primary — unless black / white (→ null: initials on ink). */
export function brandColor(colors: Record<string, unknown> | null | undefined): string | null {
  for (const key of ["accent", "primary", "link"]) {
    const v = colors?.[key];
    if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) continue;
    const l = luminance(v);
    if (l < 0.02 || l > 0.9) continue;
    return v.toUpperCase();
  }
  return null;
}

/** "https://www.carnabyandvine.com/collections/all?srsltid=…" → "carnabyandvine.com". */
export function domainOf(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Sites that are never a competitor: marketplaces, review sites, forums, social networks, news. */
const NOT_COMPETITOR =
  /(^|\.)(yelp|reddit|amazon|etsy|ebay|walmart|target|costco|wikipedia|youtube|facebook|instagram|tiktok|pinterest|linkedin|twitter|x|quora|tripadvisor|trustpilot|bbb|nextdoor|thumbtack|groupon|google|apple|nytimes|forbes|cnn|bbc|healthline|webmd|goodrx|everydayhealth|yahoo|msn|medium|substack)\.[a-z.]+$/;

export type SearchResult = { url: string; title: string; description: string; position: number };

/** Search results with tracking stripped, one per domain, never the client's own site or obvious non-competitors. */
export function cleanResults(
  results: readonly SearchResult[],
  clientDomain: string | null,
): (SearchResult & { domain: string; blocked: boolean })[] {
  const seen = new Set<string>();
  const out: (SearchResult & { domain: string; blocked: boolean })[] = [];
  for (const r of results) {
    const domain = domainOf(r.url);
    if (!domain || seen.has(domain) || domain === clientDomain) continue;
    seen.add(domain);
    let url = r.url;
    try {
      const u = new URL(r.url);
      url = `${u.origin}${u.pathname}`; // drops srsltid / utm_*
    } catch {
      /* keep */
    }
    out.push({ ...r, url, domain, blocked: NOT_COMPETITOR.test(domain) });
  }
  return out;
}

/** True when `quote` really appears on the page (case, spacing and quote marks ignored). */
export function quoteOnPage(quote: string, page: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[“”"'‘’`*_#>[\]()]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const q = norm(quote);
  return q.length >= 6 && norm(page).includes(q);
}

/** Page text for Groq: no images or link targets, at most `max` characters. */
export function pageText(markdown: string, max = 9000): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** Title + meta description + page text, as Groq sees it (rule quotes are checked against this). */
export function sitePage(m: {
  title?: string | null;
  description?: string | null;
  markdown: string;
}) {
  const head = [m.title, m.description]
    .map((s) => (s ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [...head, pageText(m.markdown)].join("\n\n");
}

export const REGULATED = [
  "health",
  "medical claims",
  "weight loss",
  "pharma",
  "supplements",
  "finance",
  "alcohol",
  "gambling",
  "tobacco",
  "cannabis",
  "kids",
  "legal",
] as const;

export type SiteProfile = {
  name: string;
  description: string;
  country: string;
  language: string;
  industry: string;
  audience: string;
  regulated: string[];
  audienceIsKids: boolean;
  healthMonths: boolean;
  rules: { id: string; rule: string; why: string; quote: string }[];
  queries: string[];
  scope: "local" | "national";
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Groq's profile → what we keep. Country / language must be ISO codes, topics from the fixed list, and
 * every content rule must quote text that is really on the page (invented rules are dropped).
 */
export function validateProfile(
  raw: unknown,
  page: string,
  fallbackName: string,
): SiteProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const country = str(r.country, 2).toUpperCase();
  const language = str(r.language, 2).toLowerCase();
  const rules = (Array.isArray(r.content_rules) ? r.content_rules : [])
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({ rule: str(x.rule, 160), why: str(x.why, 240), quote: str(x.quote, 200) }))
    .filter((x) => x.rule && x.quote && quoteOnPage(x.quote, page))
    .slice(0, 5)
    .map((x, i) => ({ id: `blip-${i + 1}`, ...x }));
  const queries = (Array.isArray(r.search_queries) ? r.search_queries : [])
    .map((q) => str(q, 120))
    .filter(Boolean)
    .slice(0, 2);
  return {
    name: str(r.name, 80) || fallbackName,
    description: str(r.description, 400),
    country: /^[A-Z]{2}$/.test(country) ? country : "US",
    language: /^[a-z]{2}$/.test(language) ? language : "en",
    industry: str(r.industry, 80),
    audience: str(r.audience, 160),
    regulated: (Array.isArray(r.regulated) ? r.regulated : [])
      .map((t) => str(t, 30).toLowerCase())
      .filter((t): t is string => (REGULATED as readonly string[]).includes(t))
      .filter((t, i, all) => all.indexOf(t) === i),
    audienceIsKids: r.audience_is_kids === true,
    healthMonths: r.health_months === true,
    rules,
    queries,
    scope: r.scope === "national" ? "national" : "local",
  };
}

export type Suggestion = { name: string; website: string; domain: string; about: string };

/**
 * Groq's sorting of the search results → suggestions in search order (competitor sites only), plus the
 * listicle to mine for national brands (the first one, if any).
 */
export function pickCompetitors(
  results: readonly (SearchResult & { domain: string; blocked: boolean })[],
  raw: unknown,
): { suggestions: Suggestion[]; listicle: string | null } {
  const items = Array.isArray((raw as { results?: unknown })?.results)
    ? ((raw as { results: unknown[] }).results as Record<string, unknown>[])
    : [];
  const byIndex = new Map(items.map((x) => [Number(x.i), x]));
  const suggestions: Suggestion[] = [];
  let listicle: string | null = null;
  results.forEach((r, i) => {
    const x = byIndex.get(i);
    if (!x || r.blocked) {
      if (x?.kind === "listicle" && !listicle) listicle = r.url;
      return;
    }
    if (x.kind === "listicle" && !listicle) listicle = r.url;
    if (x.kind !== "competitor") return;
    suggestions.push({
      name:
        str(x.name, 60) ||
        r.title
          .split(/[|–—-]/)[0]
          .trim()
          .slice(0, 60),
      website: `https://${r.domain}`,
      domain: r.domain,
      about: str(x.about, 80),
    });
  });
  return { suggestions, listicle };
}

/** Brands named in a listicle (Groq) → suggestions with a real site, not the client, not seen yet. */
export function listicleBrands(
  raw: unknown,
  known: ReadonlySet<string>,
  clientDomain: string | null,
): Suggestion[] {
  const items = Array.isArray((raw as { brands?: unknown })?.brands)
    ? ((raw as { brands: unknown[] }).brands as Record<string, unknown>[])
    : [];
  const out: Suggestion[] = [];
  for (const x of items) {
    const domain = domainOf(str(x.website, 200));
    if (!domain || domain === clientDomain || known.has(domain) || NOT_COMPETITOR.test(domain))
      continue;
    if (out.some((o) => o.domain === domain)) continue;
    out.push({
      name: str(x.name, 60) || domain,
      website: `https://${domain}`,
      domain,
      about: str(x.about, 80),
    });
  }
  return out;
}

// ───────────────────────────────────────────── Groq: schemas + prompts (Slice 17d)
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const S = { type: "string" };
const B = { type: "boolean" };

export const PROFILE_SCHEMA = {
  name: "site_profile",
  schema: obj({
    name: S,
    description: S,
    country: S,
    language: S,
    industry: S,
    audience: S,
    regulated: { type: "array", items: { type: "string", enum: [...REGULATED] } },
    audience_is_kids: B,
    health_months: B,
    content_rules: { type: "array", items: obj({ rule: S, why: S, quote: S }) },
    search_queries: { type: "array", items: S },
    scope: { type: "string", enum: ["local", "national"] },
  }),
};

export const SORT_SCHEMA = {
  name: "sorted_results",
  schema: obj({
    results: {
      type: "array",
      items: obj({
        i: { type: "integer" },
        kind: {
          type: "string",
          enum: ["competitor", "listicle", "marketplace", "forum", "news", "other"],
        },
        name: S,
        about: S,
      }),
    },
  }),
};

export const LISTICLE_SCHEMA = {
  name: "listicle_brands",
  schema: obj({ brands: { type: "array", items: obj({ name: S, website: S, about: S }) } }),
};

const FACTS_NEW =
  "Facts: Breakthirty is the agency; 30reach is its tool; you are Blip. We are adding a new client: the brand on this website.";

/** Website → profile. Rules must quote the page word for word (code drops any that don't). */
export function profileSystem(): string {
  return [
    FACTS_NEW,
    "Read the page and describe the brand for a social media team. Answer in JSON only.",
    "- name: the brand's own name, tidy (no slogans). description: one sentence, what it sells or does.",
    "- country: ISO 3166-1 alpha-2 where it is based or mainly sells (e.g. US). language: ISO 639-1 of the site.",
    "- industry: 2–5 words. audience: who buys, one short phrase.",
    "- regulated: only topics from the list that clearly apply; [] if none. audience_is_kids: true only if the buyers or users are children.",
    "- health_months: true for health, medical or wellness brands.",
    "- content_rules: 0–4 posting rules a careful marketer would follow for THIS brand. Each needs why (one sentence) and quote: words copied exactly from the page that the rule is based on. No legal requirements you can't see on the page.",
    "- search_queries: 2 web searches that find direct competitors (same product, same market; add the city for a local business).",
    "- scope: local (one city / region) or national.",
  ].join("\n");
}
export const profileUser = (url: string, page: string) => `Website: ${url}\n\n${page}`;

export function sortSystem(): string {
  return [
    FACTS_NEW,
    "Sort web search results for competitor research. For each result give i, kind and, for competitors, the brand name and about (what they sell, ≤ 6 words).",
    "- competitor: the home or shop page of one business selling the same kind of product to the same market.",
    "- listicle: an article ranking or listing several such businesses. marketplace: many sellers (Amazon, Etsy, directories). forum: Reddit, Quora. news: press, blogs, reviews. other: anything else.",
    "Answer in JSON only.",
  ].join("\n");
}
export const sortUser = (
  client: { name: string; industry: string; country: string },
  results: readonly { domain: string; title: string; description: string }[],
) =>
  `Client: ${client.name} · ${client.industry} · ${client.country}\n\n` +
  results
    .map((r, i) => `${i}. ${r.domain} | ${r.title} | ${r.description}`.slice(0, 300))
    .join("\n");

export function listicleSystem(): string {
  return [
    FACTS_NEW,
    "From this article, list the brands it recommends that compete with the client: name, their own website (domain), about (≤ 6 words). Skip the article's publisher and marketplaces. At most 8. Answer in JSON only.",
  ].join("\n");
}
export const listicleUser = (client: string, page: string) => `Client: ${client}\n\n${page}`;
