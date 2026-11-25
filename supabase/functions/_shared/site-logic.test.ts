import { describe, expect, it } from "vitest";
import atb from "./fixtures/site-all-the-best.json";
import obu from "./fixtures/site-obuhealth.json";
import carnaby from "./fixtures/site-carnaby.json";
import maarse from "./fixtures/site-maarse.json";
import baskits from "./fixtures/site-baskits.json";
import skinnyrx from "./fixtures/site-skinnyrx.json";
import searchLa from "./fixtures/search-gift-boxes-la.json";
import {
  accountFromLink,
  accountLabel,
  accountsFromLinks,
  brandColor,
  brandName,
  cleanResults,
  domainOf,
  listicleBrands,
  sitePage,
  pickCompetitors,
  quoteOnPage,
  validateProfile,
} from "./site-logic";

describe("accounts linked on a site (24 Nov spike pages)", () => {
  it("All The Best Co: Facebook + Instagram", () => {
    expect(accountsFromLinks(atb.data.links)).toEqual([
      { platform: "instagram", handle: "shop_allthebest", url: null },
      { platform: "facebook", handle: null, url: "https://www.facebook.com/shop.at.atb" },
    ]);
  });
  it("OBU: Instagram, TikTok, X, YouTube + Pinterest (coming later)", () => {
    expect(accountsFromLinks(obu.data.links).map((a) => [a.platform, a.handle])).toEqual([
      ["instagram", "obuhealth"],
      ["tiktok", "obuhealth"],
      ["x", "obuhealth"],
      ["youtube", "obuhealth"],
      ["pinterest", "obuhealth"],
    ]);
  });
  it("new Facebook /p/ links, LinkedIn company pages, YouTube channels", () => {
    const c = accountsFromLinks(carnaby.data.links);
    expect(c.find((a) => a.platform === "facebook")?.url).toBe(
      "https://www.facebook.com/profile.php?id=100095309165059",
    );
    const b = accountsFromLinks(baskits.data.links);
    expect(b.map((a) => a.platform)).toEqual([
      "instagram",
      "linkedin",
      "facebook",
      "youtube",
      "pinterest",
    ]);
    expect(b.find((a) => a.platform === "linkedin")?.url).toBe(
      "https://www.linkedin.com/company/baskits-inc/",
    );
  });
  it("profiles only: reels, groups, share links and the site's own /instagram.com paths are dropped", () => {
    expect(accountsFromLinks(maarse.data.links)).toEqual([
      { platform: "instagram", handle: "jacobmaarseflorist", url: null },
      { platform: "facebook", handle: null, url: "https://www.facebook.com/jacobmaarseflorist" },
    ]);
    // SkinnyRx links a Facebook *group*: not a page.
    expect(accountsFromLinks(skinnyrx.data.links).map((a) => a.platform)).toEqual([
      "instagram",
      "tiktok",
    ]);
    expect(accountFromLink("https://www.facebook.com/sharer/sharer.php?u=x")).toBeNull();
    expect(accountFromLink("https://www.tiktok.com/video/123")).toBeNull();
    expect(accountFromLink("https://x.com/intent/tweet?text=hi")).toBeNull();
    expect(accountFromLink("https://www.linkedin.com/in/someone")).toBeNull();
  });
  it("labels", () => {
    expect(accountLabel({ platform: "instagram", handle: "shop_allthebest", url: null })).toBe(
      "@shop_allthebest",
    );
    expect(
      accountLabel({
        platform: "facebook",
        handle: null,
        url: "https://www.facebook.com/shop.at.atb",
      }),
    ).toBe("shop.at.atb");
  });
});

describe("brand name and colour", () => {
  it("tidies and prefers the fuller title part", () => {
    const m = atb.data.metadata;
    expect(
      brandName({ brandName: atb.data.branding.brandName, siteName: m.ogSiteName, title: m.title }),
    ).toBe("All The Best Co");
    expect(brandName({ brandName: "OBU Health", title: obu.data.metadata.title })).toBe(
      "OBU Health",
    );
    expect(brandName({ title: "Shop | Acme Studio" })).toBe("Acme Studio");
  });
  it("accent, else primary; black / white → none", () => {
    expect(brandColor(atb.data.branding.colors)).toBe("#C8493F");
    expect(brandColor(obu.data.branding.colors)).toBeNull();
    expect(brandColor({ primary: "#FFFFFF", accent: "#123456" })).toBe("#123456");
  });
});

describe("search results", () => {
  const results = (
    searchLa as {
      data: { web: { url: string; title: string; description: string; position: number }[] };
    }
  ).data.web;
  it("tracking stripped, one per domain, Yelp dropped, never the client", () => {
    const clean = cleanResults(results, "all-the-best.co");
    expect(clean[0].url).toBe("https://www.carnabyandvine.com/collections/all");
    expect(new Set(clean.map((r) => r.domain)).size).toBe(clean.length);
    expect(clean.filter((r) => r.blocked).some((r) => r.domain.endsWith("yelp.com"))).toBe(true);
    expect(domainOf("www.Baskits.com/en-us")).toBe("baskits.com");
  });
  it("competitors in search order; the first listicle kept for national brands", () => {
    const clean = cleanResults(results, "all-the-best.co");
    const { suggestions, listicle } = pickCompetitors(clean, {
      results: [
        { i: 0, kind: "competitor", name: "Carnaby & Vine", about: "luxury gift boxes" },
        { i: 1, kind: "competitor", name: "Giften Market", about: "gift baskets" },
        { i: 2, kind: "listicle" },
        { i: 3, kind: "marketplace" },
      ],
    });
    expect(suggestions.map((s) => s.name)).toEqual(["Carnaby & Vine", "Giften Market"]);
    expect(suggestions[0]).toMatchObject({
      website: "https://carnabyandvine.com",
      domain: "carnabyandvine.com",
    });
    expect(listicle).toBe(clean[2].url);
    expect(
      listicleBrands(
        {
          brands: [
            { name: "Ro", website: "ro.co" },
            { name: "Dup", website: "carnabyandvine.com" },
            { name: "Yelp", website: "yelp.com" },
          ],
        },
        new Set(["carnabyandvine.com"]),
        "obuhealth.com",
      ),
    ).toEqual([{ name: "Ro", website: "https://ro.co", domain: "ro.co", about: "" }]);
  });
});

describe("content profile", () => {
  // What scan-site gives Groq: title + meta description + the page (the quote may come from any).
  const page = sitePage({
    title: obu.data.metadata.title,
    description: obu.data.metadata.description,
    markdown: obu.data.markdown,
  });
  it("keeps rules whose quote is on the page; invented ones go", () => {
    const p = validateProfile(
      {
        name: "OBU Health",
        country: "us",
        language: "EN",
        industry: "Telehealth",
        regulated: ["health", "weight loss", "astrology"],
        content_rules: [
          {
            rule: "No before / after photos",
            why: "Results vary.",
            quote: "US board-certified doctors",
          },
          {
            rule: "Add the FDA disclaimer",
            why: "Required.",
            quote: "These statements have not been evaluated",
          },
        ],
        search_queries: ["online GLP-1 weight loss", "NAD+ telehealth", "third"],
        scope: "national",
      },
      page,
      "OBU",
    );
    expect(p).toMatchObject({
      name: "OBU Health",
      country: "US",
      language: "en",
      regulated: ["health", "weight loss"],
      queries: ["online GLP-1 weight loss", "NAD+ telehealth"],
      scope: "national",
    });
    expect(p!.rules.map((r) => r.rule)).toEqual(["No before / after photos"]);
  });
  it("quotes match ignoring case, spacing and quote marks", () => {
    expect(quoteOnPage("“us  board-certified DOCTORS”", page)).toBe(true);
    expect(quoteOnPage("abc", page)).toBe(false);
  });
  it("bad answers fall back safely", () => {
    expect(validateProfile(null, page, "X")).toBeNull();
    expect(validateProfile({ country: "USA" }, page, "Acme")).toMatchObject({
      name: "Acme",
      country: "US",
      scope: "local",
    });
  });
});

describe("Add client prompts stay small", () => {
  it("system prompts", async () => {
    const { profileSystem, sortSystem, listicleSystem, sortUser } = await import("./site-logic");
    expect(profileSystem().length).toBeLessThan(1800);
    expect(sortSystem().length).toBeLessThan(900);
    expect(listicleSystem().length).toBeLessThan(500);
    const many = Array.from({ length: 20 }, () => ({
      domain: "x.com",
      title: "t".repeat(400),
      description: "d",
    }));
    expect(sortUser({ name: "A", industry: "B", country: "US" }, many).length).toBeLessThan(
      20 * 301 + 60,
    );
  });
});
