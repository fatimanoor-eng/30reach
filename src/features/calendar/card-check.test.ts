import { describe, expect, it } from "vitest";
import { checkKey, needsCheck, storedCheck } from "./card-check";

const text = { title: "Holiday eating", hook: "No guilt", caption: null, visual_idea: "" };

describe("09 health check rules", () => {
  it("compares trimmed text; empty and null are the same", () => {
    expect(checkKey(text)).toBe(checkKey({ ...text, hook: " No guilt ", visual_idea: null }));
    expect(checkKey(text)).not.toBe(checkKey({ ...text, caption: "new" }));
  });

  it("checks on the first save and after text changes, not after a status/date change", () => {
    expect(needsCheck(text, null)).toBe(true);
    expect(needsCheck(text, checkKey(text))).toBe(false);
    expect(needsCheck({ ...text, hook: "Lose 10 lbs" }, checkKey(text))).toBe(true);
  });

  it("reads the stored result from the card", () => {
    expect(storedCheck({ compliance_status: "clear", compliance_notes: null })).toEqual({
      state: "clear",
    });
    expect(
      storedCheck({
        compliance_status: "flagged",
        compliance_notes: JSON.stringify({
          v: 1,
          hash: "x",
          issues: [{ quote: "Lose 10 lbs", why: "Promise" }],
        }),
      }),
    ).toEqual({ state: "flagged", issues: [{ quote: "Lose 10 lbs", why: "Promise" }] });
    expect(storedCheck({ compliance_status: "flagged", compliance_notes: "not json" })).toBeNull();
    expect(storedCheck({ compliance_status: "unchecked", compliance_notes: null })).toBeNull();
    expect(storedCheck(null)).toBeNull();
  });
});
