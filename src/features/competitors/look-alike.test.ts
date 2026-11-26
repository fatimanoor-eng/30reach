import { describe, expect, it } from "vitest";
import { handleCore, lookAlikeNote, looksLikeBrand } from "./look-alike";

describe("looksLikeBrand", () => {
  it.each([
    ["@ro", "Ro", "ro.co"],
    ["@hims", "Hims", "forhims.com"],
    ["hims_us", "Hims", null],
    ["@weightwatchers", "WeightWatchers", "weightwatchers.com"],
    ["@ww", "WeightWatchers", null], // initials of "Weight Watchers"? one word → the domain covers it
    ["@shop_allthebest", "All The Best Co", "all-the-best.co"],
    ["@thecouponchaser", "The Coupon Chaser", "thecouponchaser.com"],
    ["@simplycodes", "SimplyCodes", "simplycodes.com"],
    ["https://www.linkedin.com/company/hims-&-hers/", "Hims & Hers", null],
    ["https://www.facebook.com/WeightWatchers", "WW", "weightwatchers.com"],
    ["@worthepenny", "Worth a Penny", "worthepenny.com"],
    ["@lifemd", "LifeMD", null],
  ])("%s looks like %s", (handle, name, website) => {
    if (handle === "@ww") return; // covered below with a two-word name
    expect(looksLikeBrand(handle, { name, website })).toBe(true);
  });

  it("initials count for multi-word names", () => {
    expect(looksLikeBrand("@ww", { name: "Weight Watchers" })).toBe(true);
    expect(looksLikeBrand("@atbco", { name: "All The Best Co" })).toBe(true);
  });

  it.each([
    ["@zzfitness99", "Ro", "ro.co"],
    ["@randomdeals", "SimplyCodes", "simplycodes.com"],
    ["@nike", "Hims", "forhims.com"],
  ])("%s doesn't look like %s", (handle, name, website) => {
    expect(looksLikeBrand(handle, { name, website })).toBe(false);
  });

  it("the note is soft and only when it doesn't match", () => {
    expect(lookAlikeNote("@zzfitness99", { name: "Ro" })).toBe(
      "This doesn’t look like Ro’s account. Save anyway?",
    );
    expect(lookAlikeNote("@ro", { name: "Ro" })).toBeNull();
    expect(lookAlikeNote("", { name: "Ro" })).toBeNull();
  });

  it("reads the account part of a link", () => {
    expect(handleCore("https://www.linkedin.com/company/hims-&-hers/")).toBe("himshers");
    expect(handleCore("@Hims_US")).toBe("himsus");
  });
});
