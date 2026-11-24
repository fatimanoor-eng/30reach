import { describe, expect, it } from "vitest";
import {
  archivedLabel,
  checksFor,
  checksSummary,
  countsSentence,
  deleteConfirmMatches,
  firstNameFrom,
  initialsFor,
  landingAfterArchive,
  manualPlatformRows,
  parseXHandle,
  normaliseWebsite,
  platformRows,
  siteHost,
  slugify,
  uniqueSlug,
} from "./client-rules";

describe("checksFor — code decides the checks (Slice 17)", () => {
  it("health topics → Health claims", () => {
    for (const t of ["health", "medical claims", "weight loss", "pharma", "supplements"]) {
      expect(checksFor([t], false)).toEqual({
        health: true,
        finance: false,
        age: false,
        kids: false,
      });
    }
  });
  it("finance, age topics, kids only for a children's audience", () => {
    expect(checksFor(["finance"], false).finance).toBe(true);
    for (const t of ["alcohol", "gambling", "cannabis", "tobacco"])
      expect(checksFor([t], false).age).toBe(true);
    expect(checksFor(["kids"], false).kids).toBe(false); // the topic alone isn't enough
    expect(checksFor([], true).kids).toBe(true);
    expect(checksFor(["legal"], false)).toEqual({
      health: false,
      finance: false,
      age: false,
      kids: false,
    });
  });
  it("reads as one line", () => {
    expect(checksSummary(["health", "weight loss"], false)).toBe(
      "health, weight loss → the health-claim check is on.",
    );
    expect(checksSummary(["finance", "alcohol"], false)).toBe(
      "finance, alcohol → the finance and age checks are on.",
    );
    expect(checksSummary([], false)).toBe("No regulated topics. Content checks are off.");
    expect(checksSummary(["legal"], false)).toBe("legal: no content check needed.");
  });
});

describe("slugs", () => {
  it("from the name", () => {
    expect(slugify("All The Best Co.")).toBe("all-the-best-co");
    expect(slugify("Café & Co")).toBe("cafe-and-co");
    expect(slugify("  !!! ")).toBe("client");
  });
  it("first free one", () => {
    expect(uniqueSlug("acme", [])).toBe("acme");
    expect(uniqueSlug("acme", ["acme", "acme-2"])).toBe("acme-3");
  });
});

describe("websites", () => {
  it("host without www, for duplicates", () => {
    expect(siteHost("https://www.OBUhealth.com/plans?utm=x")).toBe("obuhealth.com");
    expect(siteHost("all-the-best.co")).toBe("all-the-best.co");
    expect(siteHost("not a site")).toBeNull();
    expect(siteHost("ftp://x.com")).toBeNull();
    expect(normaliseWebsite("www.all-the-best.co/about")).toBe("https://all-the-best.co");
  });
});

describe("delete confirm (16d)", () => {
  it("case-insensitive, trimmed", () => {
    expect(deleteConfirmMatches("  northwind   clinic ", "Northwind Clinic")).toBe(true);
    expect(deleteConfirmMatches("Northwind", "Northwind Clinic")).toBe(false);
    expect(deleteConfirmMatches("", "")).toBe(false);
  });

  it("reads out what goes (16d)", () => {
    expect(countsSentence({ competitors: 6, pulls: 2, posts: 214, ideas: 38, cards: 12 })).toBe(
      "This deletes its 6 competitors, 2 saved pulls (214 posts), 38 ideas and 12 calendar cards, and removes their images from storage. Usage history keeps the name. This can’t be undone.",
    );
    expect(countsSentence({ competitors: 1, pulls: 0, posts: 0, ideas: 1, cards: 0 })).toContain(
      "its 1 competitor, 0 saved pulls (0 posts), 1 idea and 0 calendar cards",
    );
  });
});

describe("archived label (16c)", () => {
  const now = new Date(2026, 10, 24, 12);
  it("days and who", () => {
    expect(archivedLabel(new Date(2026, 10, 21, 9).toISOString(), "Fatima", now)).toBe(
      "Archived 3 days ago · Fatima",
    );
    expect(archivedLabel(new Date(2026, 10, 24, 9).toISOString(), null, now)).toBe(
      "Archived today",
    );
    expect(archivedLabel(new Date(2026, 10, 23, 9).toISOString(), "Ali", now)).toBe(
      "Archived yesterday · Ali",
    );
  });
  it("first names", () => {
    expect(firstNameFrom("Fatima Noor")).toBe("Fatima");
    expect(firstNameFrom(null, "ali.khan@breakthirty.com")).toBe("Ali");
    expect(firstNameFrom(null, null)).toBe("");
  });
});

describe("platformRows (16 / M19)", () => {
  const rows = [
    {
      platform: "instagram",
      state: "on",
      source: "website",
      account_url: null,
      account_handle: "obuhealth",
    },
    { platform: "linkedin", state: "on", source: "team", account_url: null, account_handle: null },
    { platform: "facebook", state: "off", source: "team", account_url: null, account_handle: null },
    {
      platform: "pinterest",
      state: "on",
      source: "website",
      account_url: "https://www.pinterest.com/obuhealth",
      account_handle: null,
    },
    {
      platform: "x",
      state: "on",
      source: "website",
      account_url: null,
      account_handle: "obuhealth",
    },
  ];
  it("website = always on, team = toggle, unsupported = coming later; missing supported = off", () => {
    expect(platformRows(rows).map((r) => [r.platform, r.kind, r.on, r.meta])).toEqual([
      ["instagram", "always", true, "@obuhealth · from the website"],
      ["tiktok", "toggle", false, "Not tracked"],
      ["linkedin", "toggle", true, "Added by the team · competitors’ pages only"],
      ["facebook", "toggle", false, "Added by the team · competitors’ pages only"],
      ["pinterest", "later", true, "pinterest.com/obuhealth · from the website"],
      ["x", "later", true, "@obuhealth · from the website"],
    ]);
  });
});

describe("landingAfterArchive (16b)", () => {
  const c = (id: string, name: string, archived = false) => ({
    id,
    slug: name.toLowerCase(),
    name,
    archived_at: archived ? "2026-11-01" : null,
  });
  const all = [c("1", "Obu"), c("2", "Best"), c("3", "Demo"), c("4", "Aardvark", true)];
  it("last other active client, else A–Z, else none", () => {
    expect(landingAfterArchive(all, "1", "demo")?.id).toBe("3");
    expect(landingAfterArchive(all, "1", "obu")?.id).toBe("2"); // the archived one isn't a landing
    expect(landingAfterArchive([c("1", "Obu"), c("4", "Aardvark", true)], "1")).toBeUndefined();
  });
});

describe("manual Add client (15f)", () => {
  it("X handles", () => {
    expect(parseXHandle("")).toBeUndefined();
    expect(parseXHandle("@OBUhealth")).toBe("obuhealth");
    expect(parseXHandle("https://x.com/obuhealth?s=20")).toBe("obuhealth");
    expect(parseXHandle("not a handle!")).toBeNull();
  });
  it("tracks the four supported platforms; X only with a handle", () => {
    const rows = manualPlatformRows({
      instagram: "allthebest",
      facebook: "https://www.facebook.com/allthebest",
      x: "allthebest",
    });
    expect(
      rows.map((r) => [r.platform, r.state, r.source, r.account_handle, r.account_url]),
    ).toEqual([
      ["instagram", "on", "team", "allthebest", null],
      ["tiktok", "on", "team", null, null],
      ["linkedin", "on", "team", null, null],
      ["facebook", "on", "team", null, "https://www.facebook.com/allthebest"],
      ["x", "on", "team", "allthebest", null],
    ]);
    expect(manualPlatformRows({}).map((r) => r.platform)).toEqual([
      "instagram",
      "tiktok",
      "linkedin",
      "facebook",
    ]);
  });
});

describe("initialsFor (new clients)", () => {
  it("first letters of the meaningful words", () => {
    expect(initialsFor("All The Best Co")).toBe("AB");
    expect(initialsFor("Carnaby & Vine")).toBe("CV");
    expect(initialsFor("Baskits")).toBe("BA");
    expect(initialsFor("The Co")).toBe("TH");
  });
});
