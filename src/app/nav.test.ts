import { describe, expect, it } from "vitest";
import { platformsWithAccounts } from "../lib/platforms";
import { platformOfPath, socialTabTarget, visibleNavSections } from "./nav";

const comp = (o: Record<string, string | null>) => ({
  instagram_handle: null,
  tiktok_handle: null,
  linkedin_url: null,
  facebook_url: null,
  ...o,
});

describe("platforms with accounts (Slice 16b)", () => {
  it("only platforms at least one competitor has a handle / page for, in order", () => {
    expect(
      platformsWithAccounts([
        comp({ instagram_handle: "ro.co" }),
        comp({ facebook_url: "https://www.facebook.com/weightwatchers", tiktok_handle: "ww" }),
      ]),
    ).toEqual(["instagram", "tiktok", "facebook"]);
    expect(platformsWithAccounts([])).toEqual([]);
  });
  it("not loaded (or failed) → everything, so nothing disappears", () => {
    expect(platformsWithAccounts(null)).toEqual([
      "instagram",
      "tiktok",
      "linkedin",
      "facebook",
      "x",
    ]);
  });
});

describe("nav (Slice 16b)", () => {
  it("sidebar / rail hide platform pages nobody has an account on; other items stay", () => {
    const [research, plan] = visibleNavSections(["instagram", "facebook"]);
    expect(research.items.map((i) => i.label)).toEqual([
      "Overview",
      "Instagram",
      "Facebook",
      "Competitors",
    ]);
    expect(plan.items.map((i) => i.label)).toEqual(["Calendar", "Idea board"]);
  });
  it("Social tab opens the first visible platform", () => {
    expect(socialTabTarget(["linkedin", "facebook"])).toBe("/linkedin");
    expect(socialTabTarget([])).toBe("/instagram");
  });
  it("platformOfPath", () => {
    expect(platformOfPath("/facebook")).toBe("facebook");
    expect(platformOfPath("/tiktok")).toBe("tiktok");
    expect(platformOfPath("/overview")).toBeUndefined();
    expect(platformOfPath("/competitors")).toBeUndefined();
  });
});
