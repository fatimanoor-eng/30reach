import { describe, expect, it } from "vitest";
import {
  creditsFraction,
  formatCompact,
  formatShortDate,
  plural,
  creditsOf,
  creditsTotal,
} from "./format";

describe("plural", () => {
  it.each([
    [0, "like", "0 likes"],
    [1, "like", "1 like"],
    [2, "comment", "2 comments"],
    [1, "credit", "1 credit"],
    [1021, "credit", "1,021 credits"],
  ])("%i %s → %s", (n, word, expected) => expect(plural(n, word)).toBe(expected));

  it("supports irregular plurals", () => expect(plural(2, "reply", "replies")).toBe("2 replies"));
});

describe("formatShortDate (design: '17 Nov')", () => {
  const now = new Date(2026, 10, 17, 12); // 17 Nov 2026, local time

  it("omits the year in the current year", () => {
    expect(formatShortDate(new Date(2026, 10, 17), now)).toBe("17 Nov");
    expect(formatShortDate(new Date(2026, 0, 1), now)).toBe("1 Jan");
    expect(formatShortDate(new Date(2026, 8, 9), now)).toBe("9 Sep"); // never "Sept"
  });

  it("adds the year for other years", () => {
    expect(formatShortDate(new Date(2025, 11, 28), now)).toBe("28 Dec 2025");
    expect(formatShortDate(new Date(2027, 0, 5), now)).toBe("5 Jan 2027");
  });

  it("returns null for missing or invalid dates", () => {
    expect(formatShortDate(null, now)).toBeNull();
    expect(formatShortDate("nope", now)).toBeNull();
  });
});

describe("creditsFraction", () => {
  it("is the share left, capped at 1 when credits exceed the plan", () => {
    expect(creditsFraction(588, 1000)).toBe(0.588);
    expect(creditsFraction(1021, 1000)).toBe(1);
  });
  it("handles zero, negative and missing plans", () => {
    expect(creditsFraction(0, 1000)).toBe(0);
    expect(creditsFraction(-5, 1000)).toBe(0);
    expect(creditsFraction(50, 0)).toBe(1);
  });
});

describe("formatCompact", () => {
  it.each([
    [640, "640"],
    [3100, "3.1K"],
    [18_412, "18.4K"],
    [212_000, "212K"],
    [1_250_000, "1.3M"],
    [999, "999"],
  ])("%i → %s", (n, expected) => expect(formatCompact(n)).toBe(expected));
});

describe("credit totals (Firecrawl's plan can be smaller than what's left)", () => {
  it("shows the total only when it's honest", () => {
    expect(creditsTotal(919, 1000)).toBe(1000);
    expect(creditsTotal(5000, 1000)).toBeNull(); // extra credits beyond the monthly plan
    expect(creditsTotal(5000, null)).toBeNull();
    expect(creditsOf(919, 1000)).toBe("919 of 1,000");
    expect(creditsOf(5000, 1000)).toBe("5,000");
  });
});
