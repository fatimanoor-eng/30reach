import { describe, expect, it } from "vitest";
import product from "./fixtures/discovery-cc-product.json";
import category from "./fixtures/discovery-cc-alt.json";
import hop from "./fixtures/discovery-cc-hop.json";
import followers from "./fixtures/discovery-cc-followers.json";
import {
  assembleDiscovery,
  corpusOf,
  followerQuery,
  followersFromSnippets,
  hopDomains,
  namedInResults,
  normName,
  discoverSystem,
  looksLikeBrandSite,
} from "./discovery-logic.ts";
import {
  accountsFromLinks,
  cleanResults,
  isNotCompetitor,
  type SearchResult,
} from "./site-logic.ts";

/*
 * Discovery 2.0 test case (spike 25 Nov 2026): The Coupon Chaser (thecouponchaser.com) must surface
 * SimplyCodes and Worth a Penny as closest rivals, and RetailMeNot / Rakuten / Ibotta as "Big in your space".
 * The search results are the real ones (fixtures). Groq's answers are fixed here, so this checks our
 * code: verification, the second hop, grouping, limits and follower matching.
 */
const CLIENT = "thecouponchaser.com";
const web = (f: { web: SearchResult[] }) => f.web;

// What the pipeline searched: the product search, then the category search.
const results = cleanResults([...web(product), ...web(category)], CLIENT);
const at = (domain: string) => results.findIndex((r) => r.domain === domain);

/** Groq's sorting (mocked): competitor sites by domain, the rest news / forum / listicle. */
const SORT = {
  results: [
    {
      i: at("simplycodes.com"),
      kind: "competitor",
      name: "SimplyCodes",
      about: "Verified promo codes",
      why: "Also tests codes at real checkouts",
      group: "rival",
    },
    {
      i: at("couponcabin.com"),
      kind: "competitor",
      name: "CouponCabin",
      about: "Verified coupons",
      why: "Verified coupon site",
      group: "rival",
    },
    {
      i: at("wethrift.com"),
      kind: "competitor",
      name: "Wethrift",
      about: "Working promo codes",
      why: "Codes most likely to work",
      group: "rival",
    },
    {
      i: at("coupons.com"),
      kind: "competitor",
      name: "Coupons.com",
      about: "Promo codes and cashback",
      why: "Tested promo codes",
      group: "rival",
    },
    {
      i: at("retailmenot.com"),
      kind: "competitor",
      name: "RetailMeNot",
      about: "Coupons and promo codes",
      why: "Biggest coupon brand",
      group: "big",
    },
    { i: at("reddit.com"), kind: "forum", name: "", about: "", why: "", group: "rival" },
    { i: at("makeuseof.com"), kind: "listicle", name: "", about: "", why: "", group: "rival" },
  ],
  brands: [],
};

/** Groq's own proposals (mocked): real brands named in the results, and one it made up. */
const PROPOSALS = {
  brands: [
    {
      name: "Honey",
      website: "joinhoney.com",
      about: "Coupon browser extension",
      why: "Most-followed coupon extension",
      group: "big",
    },
    {
      name: "Rakuten",
      website: "rakuten.com",
      about: "Cashback shopping",
      why: "Huge cashback brand",
      group: "big",
    },
    {
      name: "Ibotta",
      website: "ibotta.com",
      about: "Cashback app",
      why: "Big savings app",
      group: "big",
    },
    {
      name: "CouponZap",
      website: "couponzap.com",
      about: "Coupons",
      why: "Invented",
      group: "rival",
    },
  ],
};

describe("Discovery 2.0 — The Coupon Chaser", () => {
  const hopResults = cleanResults(web(hop), CLIENT);
  const known = new Set([CLIENT, ...results.map((r) => r.domain)]);
  const hopped = hopDomains(hopResults, known, isNotCompetitor);

  it("the second hop reads competing domains from Semrush / Similarweb snippets", () => {
    expect(hopped).toContain("worthepenny.com");
    expect(hopped).toEqual(expect.arrayContaining(["couponfollow.com", "coupert.com"]));
    expect(hopped).not.toContain("simplycodes.com"); // the rival itself
    expect(hopped).not.toContain("retailmenot.com"); // already known from the product search
  });

  const corpus = corpusOf([...web(product), ...web(category), ...web(hop)]);
  const { rivals, big } = assembleDiscovery({
    results,
    sort: SORT,
    hop: {
      rival: "SimplyCodes",
      domains: hopped,
      names: {
        brands: [
          {
            domain: "worthepenny.com",
            name: "Worth a Penny",
            about: "Coupon codes",
            group: "rival",
          },
          {
            domain: "couponfollow.com",
            name: "CouponFollow",
            about: "Coupon codes",
            group: "rival",
          },
          { domain: "valuecom.com", name: "Valuecom", about: "", group: "skip" },
        ],
      },
    },
    proposals: PROPOSALS,
    clientDomain: CLIENT,
    corpus,
    isBlocked: isNotCompetitor,
  });

  it("surfaces SimplyCodes and Worth a Penny as closest rivals, with a why", () => {
    const simply = rivals.find((r) => r.domain === "simplycodes.com");
    const penny = rivals.find((r) => r.domain === "worthepenny.com");
    expect(simply).toMatchObject({
      name: "SimplyCodes",
      group: "rival",
      website: "https://simplycodes.com",
    });
    expect(penny).toMatchObject({
      name: "Worth a Penny",
      why: "Listed as a competitor of SimplyCodes",
    });
    expect(rivals[0].domain).toBe("simplycodes.com"); // the product search's top hit leads
    expect(rivals.length).toBeLessThanOrEqual(10);
  });

  it("puts the big names in their own group (unticked later), never in both", () => {
    expect(big.map((b) => b.domain)).toEqual([
      "retailmenot.com",
      "joinhoney.com",
      "rakuten.com",
      "ibotta.com",
    ]);
    const rivalDomains = new Set(rivals.map((r) => r.domain));
    expect(big.some((b) => rivalDomains.has(b.domain))).toBe(false);
  });

  it("drops what no search names (an invented brand), skips, and never the client or blocked sites", () => {
    const all = [...rivals, ...big].map((f) => f.domain);
    expect(all).not.toContain("couponzap.com");
    expect(all).not.toContain("valuecom.com");
    expect(all).not.toContain(CLIENT);
    expect(all.some((d) => isNotCompetitor(d))).toBe(false);
  });

  it("reads approximate followers from one Instagram snippet search, matching the right account", () => {
    expect(followerQuery(big)).toBe(
      'site:instagram.com "RetailMeNot" OR "Honey" OR "Rakuten" OR "Ibotta"',
    );
    const counts = followersFromSnippets(web(followers), big);
    expect(counts.get("rakuten.com")).toEqual({
      platform: "instagram",
      handle: "rakuten",
      count: 369_000,
    });
    expect(counts.get("ibotta.com")?.count).toBe(226_000);
    expect(counts.get("retailmenot.com")?.handle).toBe("retailmenot");
    // "Honey Dijon" and "honeybooboo" aren't the Honey extension.
    expect(counts.has("joinhoney.com")).toBe(false);
  });
});

describe("namedInResults", () => {
  const corpus = corpusOf([
    {
      url: "https://example.com/list",
      title: "Best apps: Ibotta, Rakuten",
      description: "Also Pro tips",
      position: 1,
    },
  ]);
  it("needs the domain or the whole name", () => {
    expect(namedInResults({ name: "Rakuten", domain: "rakuten.com" }, corpus)).toBe(true);
    expect(namedInResults({ name: "Ro", domain: "ro.co" }, corpus)).toBe(false); // too short, no domain hit
    expect(namedInResults({ name: "Fetch", domain: "fetch.com" }, corpus)).toBe(false);
  });
  it("normalises names", () => {
    expect(normName("The Coupon Chaser")).toBe("coupon chaser");
    expect(normName("Hims & Hers")).toBe("hims and hers");
  });
});

describe("relevance — The Krazy Coupon Lady (26 Nov)", () => {
  // Live run: Food4Less and Kroger (grocery stores that offer coupons) came out as the top closest rivals.
  // Groq now labels each brand's business model; same-model rivals rank first and lead with the label.
  const CLIENT = "thekrazycouponlady.com";
  const hit = (url: string, title: string, position: number) => ({
    url,
    title,
    description: "",
    position,
  });
  const res = cleanResults(
    [
      hit("https://www.food4less.com/savings/cl/coupons/", "Digital Coupons | Food 4 Less", 1),
      hit("https://www.kroger.com/savings/cl/coupons/", "Digital Coupons | Kroger", 2),
      hit("https://www.retailmenot.com/", "RetailMeNot: Coupons & Promo Codes", 3),
      hit("https://hip2save.com/", "Hip2Save | Deals, Coupons & Freebies", 4),
      hit("https://www.couponmom.com/", "Coupon Mom", 5),
    ],
    CLIENT,
  );
  const at = (d: string) => res.findIndex((r) => r.domain === d);
  const retailer = { model: "Retailer with coupons", same_model: false, group: "rival" };
  const platform = { model: "Coupon platform", same_model: true, group: "rival" };
  const { rivals } = assembleDiscovery({
    results: res,
    sort: {
      results: [
        {
          i: at("food4less.com"),
          kind: "competitor",
          name: "Food4Less",
          about: "Groceries",
          why: "Digital coupons for its stores",
          ...retailer,
        },
        {
          i: at("kroger.com"),
          kind: "competitor",
          name: "Kroger",
          about: "Groceries",
          why: "Digital coupons for its stores",
          ...retailer,
        },
        {
          i: at("retailmenot.com"),
          kind: "competitor",
          name: "RetailMeNot",
          about: "Coupons",
          why: "Coupons across stores",
          ...platform,
        },
        {
          i: at("hip2save.com"),
          kind: "competitor",
          name: "Hip2Save",
          about: "Deals blog",
          why: "Coupon and deal posts",
          ...platform,
        },
        {
          i: at("couponmom.com"),
          kind: "competitor",
          name: "Coupon Mom",
          about: "Coupons",
          why: "",
          ...platform,
        },
      ],
      brands: [],
      client_model: "Coupon platform",
    },
    hop: null,
    proposals: null,
    clientDomain: CLIENT,
    corpus: "",
    isBlocked: isNotCompetitor,
  });

  it("ranks same-business-model rivals first; retailers with coupons follow, still suggested", () => {
    expect(rivals.map((r) => r.name)).toEqual([
      "RetailMeNot",
      "Hip2Save",
      "Coupon Mom",
      "Food4Less",
      "Kroger",
    ]);
    expect(rivals.map((r) => r.sameModel)).toEqual([true, true, true, false, false]);
  });

  it("the why leads with the business model", () => {
    expect(rivals[0].why).toBe("Coupon platform · Coupons across stores");
    expect(rivals.find((r) => r.name === "Kroger")?.why).toBe(
      "Retailer with coupons · Digital coupons for its stores",
    );
    expect(rivals.find((r) => r.name === "Coupon Mom")?.why).toBe(
      "Coupon platform · Same kind of product, found in search",
    );
  });

  it("asks Groq for the business model", () => {
    expect(discoverSystem()).toMatch(/same_model/);
    expect(discoverSystem()).toMatch(/A store that merely offers coupons is not a coupon platform/);
  });
});

describe("is this page really the brand's? (27 Nov, FAST-NUCES on Scribd)", () => {
  it("a document host's own accounts don't belong to the brand", () => {
    expect(looksLikeBrandSite("scribd.com", ["scribd"], "FAST-NUCES")).toBe(false);
    expect(isNotCompetitor("scribd.com")).toBe(true);
    expect(isNotCompetitor("www.slideshare.net")).toBe(true);
  });
  it("real brand sites pass by domain or by their accounts", () => {
    expect(looksLikeBrandSite("nu.edu.pk", ["fastnuces"], "FAST-NUCES")).toBe(true);
    expect(
      looksLikeBrandSite("nust.edu.pk", [], "National University of Sciences and Technology"),
    ).toBe(true);
    expect(looksLikeBrandSite("forhims.com", ["hims"], "Hims")).toBe(true);
    expect(looksLikeBrandSite("ro.co", [], "Ro")).toBe(true);
    expect(looksLikeBrandSite("weightwatchers.com", [], "WeightWatchers")).toBe(true);
    expect(looksLikeBrandSite("bnu.edu.pk", [], "Beaconhouse National University")).toBe(true);
  });
  it("placeholder links are never accounts", () => {
    expect(
      accountsFromLinks([
        "#",
        "javascript:void(0)",
        "",
        "https://www.instagram.com/",
        "https://instagram.com/#",
        "https://www.facebook.com/",
        "https://twitter.com/home",
        "https://www.tiktok.com/",
      ]),
    ).toEqual([]);
  });
});
