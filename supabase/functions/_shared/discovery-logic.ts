// Discovery 2.0 (25 Nov 2026): who competes with a new client. Pure rules for `suggest-competitors`
// (tested in discovery-logic.test.ts with the Coupon Chaser spike results). No network here.
//
// The spike's lesson: brand-name searches ("X alternatives") don't work for young brands. What works is
//   1. a PRODUCT search (what it does, in plain words) → the closest rivals' own sites,
//   2. a CATEGORY search (lists of the category) → the big names in the space,
//   3. a SECOND HOP on the top rival ("{rival} alternatives") → Semrush / Similarweb competitor pages whose
//      snippets name competing domains (free "competing domains" data),
// plus Groq's own proposals, kept only when a search result names them (no invented brands).
import { parseFollowers } from "./pull-logic.ts";
import { domainOf, type SearchResult } from "./site-logic.ts";

export type CleanResult = SearchResult & { domain: string; blocked: boolean };

export type Group = "rival" | "big";

/** One suggestion for Review: "Closest rivals" or "Big in your space". */
export type Found = {
  name: string;
  website: string;
  domain: string;
  /** What they sell, ≤ 6 words. */
  about: string;
  /** One line: why it's suggested. */
  why: string;
  group: Group;
  /** Its business model in a few words ("Coupon platform", "Retailer with coupons"), from Groq. */
  model?: string;
  /**
   * Same business model as the client (Groq; 26 Nov relevance fix): true = a confident like-for-like rival
   * (ranked first, may be pre-ticked); false = in the space but a different model (suggested, unticked);
   * missing = unknown (unticked).
   */
  sameModel?: boolean;
  /** Big in your space: Instagram followers read from one search's profile snippets (approximate). */
  followers?: { platform: "instagram"; handle: string; count: number } | null;
};

export const MAX_RIVALS = 10;
export const MAX_BIG = 4;
/** Fewer rivals than this after the searches and the hop → read one list page (1 credit). */
export const LIST_PAGE_BELOW = 8;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "The Coupon Chaser" → "coupon chaser"; "Worth a Penny" → "worth a penny". */
export function normName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the /, "")
    .trim();
}

/** "worthepenny.com" → "worthepenny"; "www.coupons.com" → "coupons". */
export const domainStem = (domain: string) => domain.replace(/^www\./, "").split(".")[0] ?? "";

// ───────────────────────────────────────────── the second hop
/** Sites whose pages list a domain's competitors (their search snippets name them). */
const COMPETITOR_DATA =
  /(^|\.)(semrush|similarweb|siteslike|sitelike|similarsites|ahrefs|spyfu)\.[a-z.]+$/;

/** Domains written out in text: "worthepenny.com, valuecom.com and retailmenot.com". */
const DOMAIN_IN_TEXT =
  /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|co|io|net|org|app|shop|store|us|ca|co\.uk|com\.au))\b/gi;

/**
 * The hop's search results → competing domains named in competitor-data snippets (Semrush, Similarweb…),
 * in the order they're named. Never the rival searched for, the client, or a domain already known.
 */
export function hopDomains(
  results: readonly CleanResult[],
  exclude: ReadonlySet<string>,
  isBlocked: (domain: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const r of results) {
    if (!COMPETITOR_DATA.test(r.domain)) continue;
    const text = `${r.title} ${r.description}`.toLowerCase();
    for (const m of text.matchAll(DOMAIN_IN_TEXT)) {
      const d = domainOf(m[1]);
      if (!d || exclude.has(d) || out.includes(d) || COMPETITOR_DATA.test(d) || isBlocked(d))
        continue;
      out.push(d);
    }
  }
  return out;
}

// ───────────────────────────────────────────── verification: a real search hit
/** Everything the searches returned, as one lower-case text (domains, URLs, titles, snippets). */
export function corpusOf(results: readonly SearchResult[], extra: readonly string[] = []): string {
  return [
    ...results.map((r) => `${domainOf(r.url) ?? ""} ${r.url} ${r.title} ${r.description}`),
    ...extra,
  ]
    .join("\n")
    .toLowerCase();
}

/**
 * A brand Groq proposes is kept only when a search result (or a page we read) names it: its domain, or its
 * name as whole words (names under 4 letters need the domain, so "Ro" can't match "pro").
 */
export function namedInResults(
  brand: { name: string; domain: string | null },
  corpus: string,
): boolean {
  if (brand.domain && corpus.includes(brand.domain)) return true;
  const n = normName(brand.name);
  if (n.replace(/ /g, "").length < 4) return false;
  const flat = ` ${corpus.replace(/[^a-z0-9]+/g, " ")} `;
  return flat.includes(` ${n} `) || flat.includes(` ${n.replace(/ /g, "")} `);
}

// ───────────────────────────────────────────── Groq's answers → suggestions
type Model = { model?: string; same_model?: boolean };
type SortItem = Model & {
  i: number;
  kind: string;
  name: string;
  about: string;
  why: string;
  group: string;
};
type Proposal = Model & {
  name: string;
  website: string;
  about: string;
  why: string;
  group: string;
};
type HopItem = Model & { domain: string; name: string; about: string; group: string };

/** Groq's model label + same-model flag → Found fields; the label leads the why ("Coupon platform · …"). */
function modelFields(x: Model | undefined, why: string) {
  const model = str(x?.model, 40);
  const sameModel = typeof x?.same_model === "boolean" ? x.same_model : undefined;
  const lead = model && !why.toLowerCase().startsWith(model.toLowerCase()) ? model : "";
  return {
    why: [lead, why].filter(Boolean).join(" · ").slice(0, 120),
    ...(model ? { model } : {}),
    ...(sameModel !== undefined ? { sameModel } : {}),
  };
}

/** Same business model first, then unknown, then a different model; otherwise the order found. */
const modelRank = (f: Found) => (f.sameModel === true ? 0 : f.sameModel === undefined ? 1 : 2);
export function byBusinessModel<T extends Found>(list: readonly T[]): T[] {
  return list
    .map((f, i) => [f, i] as const)
    .sort(([a, i], [b, j]) => modelRank(a) - modelRank(b) || i - j)
    .map(([f]) => f);
}

const items = <T>(raw: unknown, key: string): T[] =>
  Array.isArray((raw as Record<string, unknown> | null)?.[key])
    ? ((raw as Record<string, unknown[]>)[key] as T[])
    : [];

const asGroup = (g: unknown): Group | null =>
  g === "rival" ? "rival" : g === "big" ? "big" : null;

/**
 * Assemble the two groups (pure: Groq's sorting, the hop's named domains + Groq's names for them, Groq's
 * own proposals, and any list-page brands come in as data):
 * - Closest rivals: competitor sites from the product search (search order), then the hop's domains,
 *   then verified proposals, then list-page brands. At most 10.
 * - Big in your space: what Groq marked "big" (competitor sites or verified proposals). At most 4, never a
 *   rival too.
 * One per domain, never the client's site, never blocked sites (marketplaces, social, news).
 */
export function assembleDiscovery(input: {
  results: readonly CleanResult[];
  sort: unknown;
  hop: { rival: string; domains: readonly string[]; names: unknown } | null;
  proposals: unknown;
  listBrands?: readonly { name: string; domain: string; about: string }[];
  clientDomain: string | null;
  corpus: string;
  isBlocked: (domain: string) => boolean;
}): { rivals: Found[]; big: Found[] } {
  const seen = new Set<string>(input.clientDomain ? [input.clientDomain] : []);
  const rivals: Found[] = [];
  const big: Found[] = [];
  const add = (f: Omit<Found, "website"> & { website?: string }) => {
    if (!f.domain || seen.has(f.domain) || input.isBlocked(f.domain)) return;
    const list = f.group === "big" ? big : rivals;
    if (list.length >= (f.group === "big" ? MAX_BIG : MAX_RIVALS)) return;
    seen.add(f.domain);
    list.push({ ...f, website: `https://${f.domain}`, name: f.name || f.domain });
  };

  // 1. Competitor sites among the search results.
  const byIndex = new Map(items<SortItem>(input.sort, "results").map((x) => [Number(x.i), x]));
  input.results.forEach((r, i) => {
    const x = byIndex.get(i);
    if (!x || x.kind !== "competitor" || r.blocked) return;
    add({
      name:
        str(x.name, 60) ||
        r.title
          .split(/[|–—-]/)[0]
          .trim()
          .slice(0, 60),
      domain: r.domain,
      about: str(x.about, 80),
      ...modelFields(x, str(x.why, 100) || "Same kind of product, found in search"),
      group: asGroup(x.group) ?? "rival",
    });
  });

  // 2. The hop: domains Semrush / Similarweb name as the top rival's competitors (a hit by definition).
  if (input.hop) {
    const named = new Map(
      items<HopItem>(input.hop.names, "brands").map((x) => [domainOf(str(x.domain, 200)) ?? "", x]),
    );
    for (const d of input.hop.domains) {
      const x = named.get(d);
      if (x && x.group === "skip") continue;
      add({
        name: str(x?.name, 60) || domainStem(d),
        domain: d,
        about: str(x?.about, 80),
        ...modelFields(x, `Listed as a competitor of ${input.hop.rival}`),
        group: asGroup(x?.group) ?? "rival",
      });
    }
  }

  // 3. Groq's own proposals, only when a search result names them.
  for (const p of items<Proposal>(input.proposals, "brands")) {
    const domain = domainOf(str(p.website, 200));
    const name = str(p.name, 60);
    const group = asGroup(p.group);
    if (!domain || !name || !group) continue;
    if (!namedInResults({ name, domain }, input.corpus)) continue;
    add({ name, domain, about: str(p.about, 80), ...modelFields(p, str(p.why, 100)), group });
  }

  // 4. Brands a list page recommends (read only when rivals are short).
  for (const b of input.listBrands ?? []) {
    add({ ...b, why: "Recommended on a list of the best in this category", group: "rival" });
  }
  // Relevance (26 Nov): like-for-like rivals first ("Coupon platform" before "Retailer with coupons").
  return { rivals: byBusinessModel(rivals), big };
}

// ───────────────────────────────────────────── followers for "Big in your space"
/** One search for every big brand's Instagram profile: `site:instagram.com "A" OR "B" OR "C"`. */
export function followerQuery(brands: readonly { name: string }[]): string | null {
  const names = brands.map((b) => b.name.replace(/"/g, "").trim()).filter(Boolean);
  return names.length ? `site:instagram.com ${names.map((n) => `"${n}"`).join(" OR ")}` : null;
}

/** "Rakuten (@rakuten) • Instagram photos and videos" → { name: "Rakuten", handle: "rakuten" }. */
function profileTitle(title: string): { name: string; handle: string } | null {
  const m = title.match(/^(.*?)\s*\(@([A-Za-z0-9._]{1,30})\)/);
  return m ? { name: m[1].trim(), handle: m[2].toLowerCase() } : null;
}

/**
 * Instagram profile snippets → followers per brand domain. A result counts only when it's a profile page
 * (instagram.com/{handle}/, not a post or reel) whose name or handle matches the brand (so "Honey" the
 * extension doesn't take "Honey Dijon"'s followers). Approximate: search engines cache these numbers.
 */
export function followersFromSnippets(
  results: readonly SearchResult[],
  brands: readonly { name: string; domain: string }[],
): Map<string, { platform: "instagram"; handle: string; count: number }> {
  const out = new Map<string, { platform: "instagram"; handle: string; count: number }>();
  for (const r of results) {
    let path: string[];
    try {
      const u = new URL(r.url);
      if (!/(^|\.)instagram\.com$/.test(u.hostname)) continue;
      path = u.pathname.split("/").filter(Boolean);
    } catch {
      continue;
    }
    if (path.length !== 1) continue; // posts, reels and stories aren't profiles
    const who = profileTitle(r.title);
    const count = parseFollowers(r.description);
    if (!who || count === null) continue;
    const handle = path[0].toLowerCase();
    for (const b of brands) {
      if (out.has(b.domain)) continue;
      const n = normName(b.name).replace(/ /g, "");
      const stem = domainStem(b.domain);
      const matches = normName(who.name).replace(/ /g, "") === n || handle === n || handle === stem;
      if (matches) {
        out.set(b.domain, { platform: "instagram", handle, count });
        break;
      }
    }
  }
  return out;
}

// ───────────────────────────────────────────── Groq: schemas + prompts
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const S = { type: "string" };
const GROUP = { type: "string", enum: ["rival", "big"] };
const B = { type: "boolean" };

export const DISCOVER_SCHEMA = {
  name: "discovery",
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
        why: S,
        group: GROUP,
        model: S,
        same_model: B,
      }),
    },
    brands: {
      type: "array",
      items: obj({
        name: S,
        website: S,
        about: S,
        why: S,
        group: GROUP,
        model: S,
        same_model: B,
      }),
    },
    client_model: S,
  }),
};

export const HOP_SCHEMA = {
  name: "hop_brands",
  schema: obj({
    brands: {
      type: "array",
      items: obj({
        domain: S,
        name: S,
        about: S,
        group: { type: "string", enum: ["rival", "big", "skip"] },
        model: S,
        same_model: B,
      }),
    },
  }),
};

const FACTS =
  "Facts: Breakthirty is the agency; 30reach is its tool; you are Blip. We are adding a new client and finding who it competes with on social media.";

/** Relevance (26 Nov): The Krazy Coupon Lady's top "rivals" were Food4Less and Kroger. */
const MODEL = [
  "First decide the client's business model in 2–4 words (client_model): how it makes money, e.g. 'Coupon platform', 'Telehealth clinic', 'Gift box shop'.",
  "For every brand give model (its own business model, same style: e.g. 'Coupon platform' vs 'Retailer with coupons') and same_model: true ONLY if it makes money the same way as the client. A store that merely offers coupons is not a coupon platform.",
].join("\n");

const GROUPS = [
  "- rival: sells the same kind of product to the same shoppers (the closest competitors).",
  "- big: a well-known brand in the same space with a strong social presence (many followers, active accounts), even if less similar.",
].join("\n");

export function discoverSystem(): string {
  return [
    FACTS,
    MODEL,
    "You get web search results. For each result give i, kind and, for competitors, name (the brand), about (what they sell, ≤ 6 words), why (one short line: why they compete with the client), group, model and same_model.",
    "- competitor: the home or shop page of one business in the client's space. listicle: an article ranking several. marketplace: many sellers or a directory. forum: Reddit, Quora. news: press, blogs, reviews. other: anything else.",
    GROUPS,
    "Then list up to 12 more brands you know compete with the client (brands: name, website domain, about, why, group, model, same_model), same business model first, then big names in the space. Only real brands with their real website. Never the client itself.",
    "Answer in JSON only.",
  ].join("\n");
}

export const discoverUser = (
  client: {
    name: string;
    domain: string | null;
    description: string;
    industry: string;
    country: string;
  },
  results: readonly { domain: string; title: string; description: string }[],
) =>
  `Client: ${client.name} (${client.domain ?? "no site"}) · ${client.industry} · ${client.country}\n` +
  `What it does: ${client.description}\n\n` +
  results
    .map((r, i) => `${i}. ${r.domain} | ${r.title} | ${r.description}`.slice(0, 300))
    .join("\n");

export function hopSystem(): string {
  return [
    FACTS,
    "These websites were named as competitors of one of the client's rivals. For each: domain, name (the brand's own name, e.g. worthepenny.com → Worth a Penny), about (≤ 6 words), model (its business model in 2–4 words), same_model (true only if it makes money the same way as the client) and group:",
    GROUPS,
    "- skip: not in the client's space (agencies, tools, unrelated sites).",
    "Answer in JSON only.",
  ].join("\n");
}

export const hopUser = (
  client: { name: string; description: string },
  domains: readonly string[],
) => `Client: ${client.name} · ${client.description}\n\n${domains.join("\n")}`;
