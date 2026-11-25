import { describe, expect, it } from "vitest";
import { parseFacebookProfile, parsePage } from "../_shared/pull-logic.ts";
import fbProfile from "../_shared/fixtures/facebook-profile-weightwatchers.json";
import fbProfileNotFound from "../_shared/fixtures/facebook-profile-not-found.json";
import igPage from "../_shared/fixtures/instagram-hims.json";
import liPage from "../_shared/fixtures/linkedin-hims-hers.json";
import liNotFound from "../_shared/fixtures/linkedin-not-found.json";
import { CHECK_COST, checkOutcome, parseCheckRequest, profileOutcome } from "./logic.ts";

describe("parseCheckRequest", () => {
  it("accepts platform + handle, strips @ and lowercases", () => {
    expect(parseCheckRequest({ platform: "instagram", handle: " @Ro.Co " })).toEqual({
      platform: "instagram",
      handle: "ro.co",
    });
  });
  it("rejects unknown platforms and malformed handles", () => {
    expect(parseCheckRequest({ platform: "pinterest", handle: "ro" })).toEqual({
      error: "bad_platform",
    });
    // YouTube (18): @handles and channel links; video links are refused.
    expect(
      parseCheckRequest({ platform: "youtube", handle: "youtube.com/@WeightWatchers" }),
    ).toEqual({
      platform: "youtube",
      handle: "weightwatchers",
    });
    expect(
      parseCheckRequest({ platform: "youtube", handle: "youtube.com/watch?v=Hm3jtqHt8tM" }),
    ).toEqual({ error: "bad_handle" });
    // X (17g): handles, links, case
    expect(parseCheckRequest({ platform: "x", handle: "x.com/@Ro" })).toEqual({
      platform: "x",
      handle: "ro",
    });
    expect(parseCheckRequest({ platform: "x", handle: "not a handle" })).toEqual({
      error: "bad_handle",
    });
    expect(parseCheckRequest({ platform: "tiktok", handle: "a" })).toEqual({ error: "bad_handle" }); // < 2
    expect(parseCheckRequest({ platform: "instagram", handle: "has space" })).toEqual({
      error: "bad_handle",
    });
    expect(parseCheckRequest({ platform: "instagram", handle: "x".repeat(31) })).toEqual({
      error: "bad_handle",
    });
    expect(parseCheckRequest({ platform: "instagram" })).toEqual({ error: "bad_handle" });
  });
  it("LinkedIn: a company page URL or slug → the canonical URL", () => {
    expect(
      parseCheckRequest({
        platform: "linkedin",
        handle: "linkedin.com/company/Hims-%26-Hers/posts",
      }),
    ).toEqual({ platform: "linkedin", handle: "https://www.linkedin.com/company/hims-&-hers/" });
    expect(parseCheckRequest({ platform: "linkedin", handle: "noom" })).toEqual({
      platform: "linkedin",
      handle: "https://www.linkedin.com/company/noom/",
    });
  });
  it("LinkedIn: personal profiles and malformed input never reach Firecrawl", () => {
    expect(
      parseCheckRequest({ platform: "linkedin", handle: "https://www.linkedin.com/in/someone" }),
    ).toEqual({ error: "bad_handle" });
    expect(parseCheckRequest({ platform: "linkedin", handle: "two words" })).toEqual({
      error: "bad_handle",
    });
  });
});

describe("checkOutcome", () => {
  it("a page of posts = ok, with its credit cost", () => {
    const out = checkOutcome(parsePage("instagram", igPage, 0));
    expect(out).toMatchObject({ status: "ok" });
    expect((out as { creditsUsed: number }).creditsUsed).toBeGreaterThanOrEqual(0);
  });
  it("provider not_found = not_found (0 credits)", () => {
    const body = {
      data: {
        alexandria: [{ error: { code: "not_found", message: "User not found" }, creditsCost: 0 }],
      },
    };
    expect(checkOutcome(parsePage("tiktok", body, 0))).toEqual({
      status: "not_found",
      creditsUsed: 0,
    });
  });
  it("other provider errors are passed on, not treated as not found", () => {
    const body = { data: { alexandria: [{ error: { code: "timeout" }, creditsCost: 0 }] } };
    expect(checkOutcome(parsePage("instagram", body, 0))).toEqual({
      error: "timeout",
      creditsUsed: 0,
    });
  });
  it("LinkedIn: invalid_option on a well-formed page = not_found (0 credits)", () => {
    expect(checkOutcome(parsePage("linkedin", liNotFound, 0))).toEqual({
      status: "not_found",
      creditsUsed: 0,
    });
  });
  it("LinkedIn: a page of posts = ok, with followers", () => {
    expect(checkOutcome(parsePage("linkedin", liPage, 0))).toEqual({
      status: "ok",
      creditsUsed: 1,
      followers: 246391,
    });
  });
});

describe("Facebook (16a): page link → AnyAPI profile with followers", () => {
  it("normalises a page link or username; refuses groups and other links before any credits", () => {
    expect(
      parseCheckRequest({ platform: "facebook", handle: "m.facebook.com/WeightWatchers/posts" }),
    ).toEqual({ platform: "facebook", handle: "https://www.facebook.com/weightwatchers" });
    expect(parseCheckRequest({ platform: "facebook", handle: "@ro.co" })).toEqual({
      platform: "facebook",
      handle: "https://www.facebook.com/ro.co",
    });
    expect(
      parseCheckRequest({ platform: "facebook", handle: "https://www.facebook.com/groups/x" }),
    ).toEqual({ error: "bad_handle" });
    expect(parseCheckRequest({ platform: "facebook", handle: "two words" })).toEqual({
      error: "bad_handle",
    });
  });
  it("costs up to 5 (the 402 check), the others up to 2", () => {
    expect(CHECK_COST).toEqual({
      instagram: 2,
      tiktok: 2,
      linkedin: 2,
      facebook: 5,
      x: 1,
      youtube: 0,
    });
  });
  it("found → ok with followers; made-up page → not_found at 0 credits", () => {
    expect(profileOutcome(parseFacebookProfile(fbProfile))).toEqual({
      status: "ok",
      creditsUsed: 5,
      followers: 2_901_902,
    });
    expect(profileOutcome(parseFacebookProfile(fbProfileNotFound))).toEqual({
      status: "not_found",
      creditsUsed: 0,
    });
  });
  it("other AnyAPI errors are passed on (the panel says 'couldn't check')", () => {
    const body = { data: { alexandria: [{ error: { code: "upstream_timeout" } }] } };
    expect(profileOutcome(parseFacebookProfile(body))).toEqual({
      error: "upstream_timeout",
      creditsUsed: 0,
    });
  });
});
