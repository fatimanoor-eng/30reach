import { describe, expect, it } from "vitest";
import { parseHandle } from "../../competitors/competitor-rules";
import {
  checklistRows,
  competitorMeta,
  competitorRowsForCreate,
  type ParseAccount,
  platformRowsForCreate,
  noAccountsFound,
  reviewDefaults,
  reviewErrors,
  type SiteScan,
  type Suggestion,
  summaryLine,
  welcomeDetail,
} from "./add-client-rules";

const parse: ParseAccount = (p, v) => {
  const r = parseHandle(p, v);
  return r.kind === "ok"
    ? { value: r.handle }
    : { value: null, error: r.kind === "invalid" ? r.message : undefined };
};

const scan: SiteScan = {
  status: "ok",
  credits: 1,
  website: "https://all-the-best.co",
  name: "All The Best Co",
  description: "Luxury gift boxes and fresh flowers from a studio in Pasadena, CA.",
  country: "US",
  language: "en",
  industry: "Luxury gifting / florist",
  audience: "Gift buyers in LA",
  regulated: [],
  audienceIsKids: false,
  healthMonths: false,
  rules: [
    {
      id: "blip-1",
      rule: "Show prices clearly",
      why: "Offers must say what's off.",
      quote: "SHOP THE HOLIDAY COLLECTION NOW!",
    },
  ],
  queries: ["luxury gift boxes Los Angeles"],
  scope: "local",
  color: "#C8493F",
  logoPath: "scans/abc.png",
  logoUrl: "https://signed/abc.png",
  accounts: [
    { platform: "instagram", handle: "shop_allthebest", url: null },
    { platform: "facebook", handle: null, url: "https://www.facebook.com/shop.at.atb" },
  ],
};
const ig = (h: string) => ({ platform: "instagram" as const, handle: h, url: null });
const sug = (name: string, domain: string, accounts: Suggestion["accounts"]): Suggestion => ({
  name,
  website: `https://${domain}`,
  domain,
  about: "gifts",
  accounts,
});
const suggestions = [
  sug("Carnaby & Vine", "carnabyandvine.com", [
    ig("carnabyandvine"),
    { platform: "pinterest", handle: "carnabyandvine", url: null },
  ]),
  sug("Giften Market", "giftenmarket.com", []),
  sug("Baskits", "baskits.com", [ig("baskitsinc")]),
  sug("Gourmet Gift 4U", "gourmetgift4u.com", [ig("gourmetgift4u")]),
  sug("Jacob Maarse Florist", "jacobmaarse.com", [ig("jacobmaarseflorist")]),
  sug("Pasadena Floral Design", "pasadenafloraldesign.com", [ig("pfd")]),
];

describe("15c checklist", () => {
  it("before the page is read", () => {
    const rows = checklistRows({
      website: "https://all-the-best.co",
      scan: null,
      suggestions: null,
      accountsRead: 0,
      searching: false,
    });
    expect(rows.map((r) => [r.label, r.meta, r.state])).toEqual([
      ["Reading all-the-best.co", "", "active"],
      ["Content profile", "NEXT", "next"],
      ["Competitors", "NEXT", "next"],
      ["Competitors’ social accounts", "NEXT", "next"],
    ]);
  });
  it("like the frame: found, not on their site, searching, then accounts n of m", () => {
    const searching = checklistRows({
      website: scan.website,
      scan,
      suggestions: null,
      accountsRead: 0,
      searching: true,
    });
    expect(searching.map((r) => [r.label, r.meta, r.state])).toEqual([
      ["Name · All The Best Co", "FOUND", "done"],
      ["Logo and brand colour", "FOUND", "done"],
      ["Instagram · @shop_allthebest", "FOUND", "done"],
      ["Facebook · shop.at.atb", "FOUND", "done"],
      ["TikTok, LinkedIn, X, YouTube", "NOT ON THEIR SITE", "muted"],
      ["Content profile · Luxury gifting / florist, US", "DONE", "done"],
      ["Competitors · searching “luxury gift boxes Los Angeles”", "SEARCHING", "active"],
      ["Competitors’ social accounts", "NEXT", "next"],
    ]);
    const reading = checklistRows(
      { website: scan.website, scan, suggestions, accountsRead: 3, searching: false },
      { short: true },
    );
    expect(reading.slice(-2).map((r) => [r.label, r.meta, r.state])).toEqual([
      ["Competitors", "6 FOUND", "done"],
      ["Their social accounts", "3 OF 6", "active"],
    ]);
    expect(reading[4].meta).toBe("NOT ON SITE");
  });
});

describe("15d review defaults", () => {
  const d = reviewDefaults(scan, suggestions);
  it("site links always on; the rest team rows, off", () => {
    expect(d.platforms.map((p) => [p.platform, p.source, p.on])).toEqual([
      ["instagram", "website", true],
      ["facebook", "website", true],
      ["tiktok", "team", false],
      ["linkedin", "team", false],
      ["x", "team", false],
      ["youtube", "team", false], // Slice 18
    ]);
  });
  it("pre-ticks the first 4 with an account 30reach pulls", () => {
    expect(d.competitors.filter((c) => c.ticked).map((c) => c.name)).toEqual([
      "Carnaby & Vine",
      "Baskits",
      "Gourmet Gift 4U",
      "Jacob Maarse Florist",
    ]);
    expect(summaryLine(d)).toBe("4 COMPETITORS · 2 PLATFORMS · FIRST PULL IS NEXT");
    expect(summaryLine(d, { short: true })).toBe("4 COMPETITORS · 2 PLATFORMS");
    // Discovery 2.0: "no accounts found · add" is its own part of the row, not the meta line.
    expect(competitorMeta(d.competitors[1])).toBe("giftenmarket.com · gifts");
    expect(noAccountsFound(d.competitors[1])).toBe(true);
    expect(noAccountsFound(d.competitors[0])).toBe(false);
    expect(competitorMeta(d.competitors[0])).toBe("carnabyandvine.com · gifts");
  });
});

describe("Discovery 2.0 review groups", () => {
  const big: Suggestion[] = [
    {
      name: "RetailMeNot",
      website: "https://retailmenot.com",
      domain: "retailmenot.com",
      about: "Coupons",
      why: "Biggest coupon brand",
      accounts: null,
      followers: { platform: "instagram", handle: "retailmenot", count: 81_000 },
    },
  ];
  const unread: Suggestion = {
    ...suggestions[0],
    domain: "late.com",
    website: "https://late.com",
    accounts: null,
  };
  const d = reviewDefaults(scan, [...suggestions, unread], big);
  it("Big in your space comes after the rivals, unticked and not read yet", () => {
    const b = d.competitors.find((c) => c.domain === "retailmenot.com")!;
    expect(b).toMatchObject({
      group: "big",
      ticked: false,
      scanned: false,
      why: "Biggest coupon brand",
    });
    expect(d.competitors.at(-1)?.domain).toBe("retailmenot.com");
    expect(noAccountsFound(b)).toBe(false); // not read yet: no "no accounts found"
  });
  it("a rival the scan didn't read waits for a tick", () => {
    expect(d.competitors.find((c) => c.domain === "late.com")?.scanned).toBe(false);
  });
  it("ticked big brand without a site read: its Instagram from the follower snippet", () => {
    const ticked = {
      ...d,
      competitors: d.competitors.map((c) => ({ ...c, ticked: c.group === "big" })),
    };
    const rows = competitorRowsForCreate(ticked, () => ({ value: null }));
    expect(rows).toEqual([
      expect.objectContaining({
        name: "RetailMeNot",
        instagram_handle: "retailmenot",
        logo_path: null,
      }),
    ]);
  });
});

describe("Create rows", () => {
  it("platforms: website on; a team platform switched on keeps its typed account; others off", () => {
    const d = reviewDefaults(scan, suggestions);
    d.platforms = d.platforms.map((p) =>
      p.platform === "tiktok" ? { ...p, on: true, input: "@AllTheBest" } : p,
    );
    expect(platformRowsForCreate(d, parse)).toEqual([
      {
        platform: "instagram",
        state: "on",
        source: "website",
        account_handle: "shop_allthebest",
        account_url: null,
      },
      {
        platform: "facebook",
        state: "on",
        source: "website",
        account_handle: null,
        account_url: "https://www.facebook.com/shop.at.atb",
      },
      {
        platform: "tiktok",
        state: "on",
        source: "team",
        account_handle: "allthebest",
        account_url: null,
      },
      {
        platform: "linkedin",
        state: "off",
        source: "team",
        account_handle: null,
        account_url: null,
      },
      // Slice 17g: X is supported, so a site without an X link gets an off team row like the others.
      { platform: "x", state: "off", source: "team", account_handle: null, account_url: null },
      {
        platform: "youtube",
        state: "off",
        source: "team",
        account_handle: null,
        account_url: null,
      },
    ]);
  });
  it("competitors: ticked ones, found or typed accounts, no duplicate names", () => {
    const d = reviewDefaults(scan, suggestions);
    d.competitors[1] = {
      ...d.competitors[1],
      ticked: true,
      inputs: { instagram: "@giftenmarket" },
    };
    d.competitors.push({ ...d.competitors[0], key: "dup" });
    const rows = competitorRowsForCreate(d, parse);
    expect(rows.map((r) => [r.name, r.initials, r.instagram_handle])).toEqual([
      ["Carnaby & Vine", "CV", "carnabyandvine"],
      ["Giften Market", "GM", "giftenmarket"],
      ["Baskits", "Ba", "baskitsinc"],
      ["Gourmet Gift 4U", "GG", "gourmetgift4u"],
      ["Jacob Maarse Florist", "JM", "jacobmaarseflorist"],
    ]);
  });
  it("blocks Create on a missing name, a bad colour or a bad typed handle", () => {
    const d = reviewDefaults(scan, suggestions);
    expect(reviewErrors(d, parse)).toEqual([]);
    d.name = " ";
    d.color = "#12";
    d.competitors[1] = {
      ...d.competitors[1],
      ticked: true,
      inputs: { instagram: "not a handle!" },
    };
    expect(reviewErrors(d, parse)).toEqual([
      "name",
      "color",
      "competitor-giftenmarket.com-instagram",
    ]);
  });
});

describe("15g welcome", () => {
  it("after Later / after Pull now", () => {
    expect(welcomeDetail(4, ["instagram", "facebook"], false)).toBe(
      "4 competitors · Instagram, Facebook. Press Refresh when you’re ready.",
    );
    expect(welcomeDetail(1, ["instagram"], true)).toBe(
      "1 competitor · Instagram. First pull is running.",
    );
  });
});
