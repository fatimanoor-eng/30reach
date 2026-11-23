import { describe, expect, it } from "vitest";
import type { Competitor } from "../../lib/useCompetitors";
import {
  competitorStatus,
  duplicateOf,
  handlesToCheck,
  linkedInDisplay,
  parseHandle,
  suggestInitials,
} from "./competitor-rules";

const comp = (o: Partial<Competitor>): Competitor => ({
  id: "c1",
  name: "Found",
  initials: "Fo",
  instagram_handle: "joinfound",
  tiktok_handle: "joinfound",
  linkedin_url: null,
  instagram_status: "ok",
  tiktok_status: "ok",
  linkedin_status: "unchecked",
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
    expect(handlesToCheck({}, { instagram: "noom", tiktok: null, linkedin: null })).toEqual([
      "instagram",
    ]);
    expect(
      handlesToCheck(
        { instagram: "noom", tiktok: "noom" },
        { instagram: "noom", tiktok: "noomofficial", linkedin: li },
      ),
    ).toEqual(["tiktok", "linkedin"]);
    expect(
      handlesToCheck(
        { instagram: "noom", tiktok: "noom", linkedin: li },
        { instagram: "noom", tiktok: null, linkedin: null },
      ),
    ).toEqual([]); // removing a handle or page costs nothing
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
