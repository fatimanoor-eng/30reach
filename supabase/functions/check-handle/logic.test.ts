import { describe, expect, it } from "vitest";
import { parsePage } from "../_shared/pull-logic.ts";
import igPage from "../_shared/fixtures/instagram-hims.json";
import { checkOutcome, parseCheckRequest } from "./logic.ts";

describe("parseCheckRequest", () => {
  it("accepts platform + handle, strips @ and lowercases", () => {
    expect(parseCheckRequest({ platform: "instagram", handle: " @Ro.Co " })).toEqual({
      platform: "instagram",
      handle: "ro.co",
    });
  });
  it("rejects unknown platforms and malformed handles", () => {
    expect(parseCheckRequest({ platform: "x", handle: "ro" })).toEqual({ error: "bad_platform" });
    expect(parseCheckRequest({ platform: "tiktok", handle: "a" })).toEqual({ error: "bad_handle" }); // < 2
    expect(parseCheckRequest({ platform: "instagram", handle: "has space" })).toEqual({
      error: "bad_handle",
    });
    expect(parseCheckRequest({ platform: "instagram", handle: "x".repeat(31) })).toEqual({
      error: "bad_handle",
    });
    expect(parseCheckRequest({ platform: "instagram" })).toEqual({ error: "bad_handle" });
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
});
