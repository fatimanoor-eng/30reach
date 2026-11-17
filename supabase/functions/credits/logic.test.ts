import { describe, expect, it } from "vitest";
import { CACHE_TTL_MS, isFresh, parseCachedMeter, parseCreditUsage } from "./logic.ts";

// Shape captured in the Slice 1 spike (.spike/credits-*.json).
const firecrawl = {
  success: true,
  data: {
    remainingCredits: 996,
    planCredits: 1000,
    billingPeriodStart: "2026-11-17T10:11:51.708Z",
    billingPeriodEnd: "2026-12-17T10:11:51.708Z",
  },
};

describe("parseCreditUsage", () => {
  it("maps Firecrawl's fields", () => {
    expect(parseCreditUsage(firecrawl)).toEqual({
      remaining: 996,
      plan: 1000,
      periodStart: "2026-11-17T10:11:51.708Z",
      resetsAt: "2026-12-17T10:11:51.708Z",
    });
  });

  it("keeps the numbers when the period dates are missing", () => {
    const body = { data: { remainingCredits: 5, planCredits: 1000, billingPeriodEnd: null } };
    expect(parseCreditUsage(body)).toEqual({
      remaining: 5,
      plan: 1000,
      periodStart: null,
      resetsAt: null,
    });
  });

  it.each([
    null,
    {},
    { success: false, error: "Unauthorized" },
    { data: { remainingCredits: "996", planCredits: 1000 } },
    { data: { remainingCredits: 996 } },
  ])("rejects an unexpected shape: %j", (body) => {
    expect(parseCreditUsage(body)).toBeNull();
  });
});

describe("parseCachedMeter", () => {
  it("accepts what we cached", () => {
    const meter = parseCreditUsage(firecrawl);
    expect(parseCachedMeter(meter)).toEqual(meter);
  });
  it("rejects junk", () => expect(parseCachedMeter({ remaining: "x" })).toBeNull());
});

describe("isFresh (5-minute cache)", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  it("is fresh just under 5 minutes", () => {
    expect(isFresh(new Date(now - CACHE_TTL_MS + 1000).toISOString(), now)).toBe(true);
  });
  it("is stale at 5 minutes", () => {
    expect(isFresh(new Date(now - CACHE_TTL_MS).toISOString(), now)).toBe(false);
  });
  it("treats missing, invalid or future timestamps as stale", () => {
    expect(isFresh(null, now)).toBe(false);
    expect(isFresh("nope", now)).toBe(false);
    expect(isFresh(new Date(now + 60_000).toISOString(), now)).toBe(false);
  });
});
