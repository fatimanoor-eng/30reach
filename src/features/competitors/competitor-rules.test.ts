import { describe, expect, it } from "vitest";
import type { Competitor } from "../../lib/useCompetitors";
import {
  checkCostNote,
  competitorStatus,
  duplicateOf,
  facebookDisplay,
  facebookPageUrl,
  foundMessage,
  handlesToCheck,
  linkedInDisplay,
  parseHandle,
  suggestInitials,
  targetDisplay,
} from "./competitor-rules";

const comp = (o: Partial<Competitor>): Competitor => ({
  id: "c1",
  name: "Found",
  initials: "Fo",
  instagram_handle: "joinfound",
  tiktok_handle: "joinfound",
  linkedin_url: null,
  facebook_url: null,
  instagram_status: "ok",
  tiktok_status: "ok",
  linkedin_status: "unchecked",
  facebook_status: "unchecked",
  facebook_followers: null,
  facebook_followers_at: null,
  ...o,
});

describe("suggestInitials (matches the seeded brands)", () => {
  it.each([
    ["WeightWatchers", "WW"],
    ["LifeMD", "LM"],
    ["Hims", "Hi"],
    ["Hers", "He"],
    ["Ro", "Ro"],
    ["Found", "Fo"],
    ["Weight Watchers", "WW"],
    ["noom", "No"],
    ["  ", ""],
    ["X", "X"],
  ])("%s → %s", (name, initials) => expect(suggestInitials(name)).toBe(initials));
});

describe("parseHandle", () => {
  it("accepts @handle, plain handle and profile links; lowercases", () => {
    expect(parseHandle("instagram", "@Noom")).toEqual({ kind: "ok", handle: "noom" });
    expect(parseHandle("instagram", "https://www.instagram.com/ro.co/?hl=en")).toEqual({
      kind: "ok",
      handle: "ro.co",
    });
    expect(parseHandle("tiktok", "tiktok.com/@noomofficial?lang=en")).toEqual({
      kind: "ok",
      handle: "noomofficial",
    });
  });
  it("empty and invalid", () => {
    expect(parseHandle("tiktok", "   ")).toEqual({ kind: "empty" });
    expect(parseHandle("instagram", "no spaces").kind).toBe("invalid");
    expect(parseHandle("tiktok", "a").kind).toBe("invalid");
    expect(parseHandle("instagram", "x".repeat(31)).kind).toBe("invalid");
  });
  it("LinkedIn: a company page link or slug → the canonical page URL", () => {
    const hims = { kind: "ok", handle: "https://www.linkedin.com/company/hims-&-hers/" };
    expect(parseHandle("linkedin", "https://www.linkedin.com/company/hims-&-hers/posts/")).toEqual(
      hims,
    );
    expect(parseHandle("linkedin", "linkedin.com/company/Hims-%26-Hers")).toEqual(hims);
    expect(parseHandle("linkedin", "hims-&-hers")).toEqual(hims);
    expect(parseHandle("linkedin", "")).toEqual({ kind: "empty" });
  });
  it("LinkedIn: personal profiles and other links are invalid (never cost credits)", () => {
    expect(parseHandle("linkedin", "https://www.linkedin.com/in/someone/")).toEqual({
      kind: "invalid",
      message: "Use a company page link (linkedin.com/company/…).",
    });
    expect(parseHandle("linkedin", "https://hims.com").kind).toBe("invalid");
    expect(parseHandle("linkedin", "two words").kind).toBe("invalid");
  });
  it("LinkedIn: what the field shows for a saved page", () => {
    expect(linkedInDisplay("https://www.linkedin.com/company/hims-&-hers/")).toBe(
      "linkedin.com/company/hims-&-hers",
    );
  });
});

describe("handlesToCheck", () => {
  it("only new or changed, never empty", () => {
    const li = "https://www.linkedin.com/company/noom/";
    const fb = "https://www.facebook.com/noom";
    expect(
      handlesToCheck({}, { instagram: "noom", tiktok: null, linkedin: null, facebook: null }),
    ).toEqual(["instagram"]);
    expect(
      handlesToCheck(
        { instagram: "noom", tiktok: "noom" },
        { instagram: "noom", tiktok: "noomofficial", linkedin: li, facebook: fb },
      ),
    ).toEqual(["tiktok", "linkedin", "facebook"]);
    expect(
      handlesToCheck(
        { instagram: "noom", tiktok: "noom", linkedin: li, facebook: fb },
        { instagram: "noom", tiktok: null, linkedin: null, facebook: null },
      ),
    ).toEqual([]); // removing a handle or page costs nothing
    expect(
      handlesToCheck(
        { instagram: "noom", facebook: fb },
        { instagram: "noom", tiktok: null, linkedin: null, facebook: fb },
      ),
    ).toEqual([]); // an unchanged Facebook page isn't checked again (no 5 credits for followers)
  });
});

describe("duplicateOf", () => {
  it("finds another brand with the same handle, ignoring itself", () => {
    const list = [comp({}), comp({ id: "c2", name: "Ro", instagram_handle: "ro.co" })];
    expect(duplicateOf(list, "instagram", "RO.CO")?.name).toBe("Ro");
    expect(duplicateOf(list, "instagram", "ro.co", "c2")).toBeNull();
  });
  it("LinkedIn pages too", () => {
    const url = "https://www.linkedin.com/company/hims-&-hers/";
    const list = [comp({ id: "c2", name: "Hims & Hers", linkedin_url: url })];
    expect(duplicateOf(list, "linkedin", url)?.name).toBe("Hims & Hers");
  });
});

describe("competitorStatus", () => {
  it("OK when every present handle is ok (missing TikTok is fine)", () => {
    expect(competitorStatus(comp({ tiktok_handle: null, tiktok_status: "unchecked" }))).toEqual({
      label: "OK",
      tone: "ok",
    });
  });
  it("names the platform that wasn't found", () => {
    expect(competitorStatus(comp({ tiktok_status: "not_found" }))).toEqual({
      label: "TikTok not found",
      tone: "danger",
    });
    expect(
      competitorStatus(comp({ tiktok_status: "not_found", instagram_status: "not_found" })).label,
    ).toBe("Not found");
  });
  it("LinkedIn counts once a page is set", () => {
    const url = "https://www.linkedin.com/company/x/";
    expect(competitorStatus(comp({ linkedin_url: url, linkedin_status: "not_found" }))).toEqual({
      label: "LinkedIn not found",
      tone: "danger",
    });
    expect(competitorStatus(comp({ linkedin_url: url })).label).toBe("Not checked");
    expect(competitorStatus(comp({ linkedin_url: url, linkedin_status: "ok" })).label).toBe("OK");
    expect(competitorStatus(comp({ linkedin_status: "not_found" })).label).toBe("OK"); // no page set
  });
  it("Not checked while any present handle is unchecked", () => {
    expect(competitorStatus(comp({ instagram_status: "unchecked" })).label).toBe("Not checked");
  });
});

describe("Facebook page field (16a, validated before any credits)", () => {
  it.each([
    ["https://www.facebook.com/weightwatchers", "https://www.facebook.com/weightwatchers"],
    ["https://www.facebook.com/WeightWatchers/", "https://www.facebook.com/weightwatchers"],
    ["facebook.com/weightwatchers/posts", "https://www.facebook.com/weightwatchers"],
    ["m.facebook.com/weightwatchers?ref=share", "https://www.facebook.com/weightwatchers"],
    ["fb.com/ro.co", "https://www.facebook.com/ro.co"],
    ["@weightwatchers", "https://www.facebook.com/weightwatchers"],
    ["weightwatchers", "https://www.facebook.com/weightwatchers"],
    [
      "https://www.facebook.com/profile.php?id=100076474051751",
      "https://www.facebook.com/profile.php?id=100076474051751",
    ],
  ])("%s → %s", (input, url) => {
    expect(facebookPageUrl(input)).toBe(url);
    expect(parseHandle("facebook", input)).toEqual({ kind: "ok", handle: url });
  });
  it.each([
    "https://www.facebook.com/groups/weightwatchers",
    "https://www.facebook.com/events/123456",
    "https://www.facebook.com/reel/979224541550335/",
    "https://www.facebook.com/people/Some-Name/100012345678",
    "https://www.facebook.com/",
    "https://www.facebook.com/profile.php",
    "https://www.instagram.com/weightwatchers",
    "two words",
    "x",
  ])("refuses %s", (input) => {
    expect(facebookPageUrl(input)).toBeNull();
    expect(parseHandle("facebook", input)).toEqual({
      kind: "invalid",
      message: "Use a Facebook page link (facebook.com/…).",
    });
  });
  it("empty is optional", () => {
    expect(parseHandle("facebook", "  ")).toEqual({ kind: "empty" });
  });
  it("what the field and the table show", () => {
    expect(facebookDisplay("https://www.facebook.com/weightwatchers")).toBe(
      "facebook.com/weightwatchers",
    );
    expect(targetDisplay("facebook", "https://www.facebook.com/ro.co")).toBe("facebook.com/ro.co");
    expect(targetDisplay("instagram", "ro.co")).toBe("ro.co");
  });
  it("duplicates and status count Facebook too", () => {
    const url = "https://www.facebook.com/weightwatchers";
    const list = [comp({ id: "c2", name: "WeightWatchers", facebook_url: url })];
    expect(duplicateOf(list, "facebook", url)?.name).toBe("WeightWatchers");
    expect(competitorStatus(comp({ facebook_url: url, facebook_status: "not_found" }))).toEqual({
      label: "Facebook not found",
      tone: "danger",
    });
    expect(competitorStatus(comp({ facebook_url: url })).label).toBe("Not checked");
    expect(competitorStatus(comp({ facebook_url: url, facebook_status: "ok" })).label).toBe("OK");
  });
});

describe("07b copy: found message and cost line", () => {
  const now = new Date("2026-11-24T12:00:00");
  it("found messages per platform; Facebook shows followers and, once saved, the date", () => {
    expect(foundMessage("instagram")).toBe("Found · public account");
    expect(foundMessage("linkedin")).toBe("Found · public company page");
    expect(foundMessage("facebook")).toBe("Found · public page");
    expect(foundMessage("facebook", 2_901_902)).toBe("Found · public page · 2.9M followers");
    expect(foundMessage("facebook", 2_901_902, "2026-11-24T10:00:00Z", now)).toBe(
      "Found · public page · 2.9M followers as of 24 Nov",
    );
  });
  it("cost line: 2 per handle, up to 5 for a Facebook page", () => {
    expect(checkCostNote([])).toBe("No handle to check · no credits");
    expect(checkCostNote(["instagram", "linkedin"])).toBe(
      "Checking costs 2 credits per handle · up to 4 now",
    );
    expect(checkCostNote(["facebook"])).toBe("Checking costs up to 5 credits");
    expect(checkCostNote(["tiktok", "facebook"])).toBe(
      "Checking costs 2 per handle, 5 for Facebook · up to 7 now",
    );
  });
});

describe("Facebook /p/ page links (Slice 17a)", () => {
  it("accepts the newer page link and stores it by id", () => {
    expect(
      parseHandle("facebook", "https://www.facebook.com/p/Carnaby-Vine-100095309165059/"),
    ).toEqual({
      kind: "ok",
      handle: "https://www.facebook.com/profile.php?id=100095309165059",
    });
    expect(parseHandle("facebook", "facebook.com/p/carnaby").kind).toBe("invalid");
  });
});
