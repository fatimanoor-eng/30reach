import { describe, expect, it } from "vitest";
import { aliasesText, displayName, parseAliases, shortNameValue } from "./names";

describe("names", () => {
  it("display name prefers the short name", () => {
    expect(
      displayName({ name: "National University of Sciences and Technology", short_name: "NUST" }),
    ).toBe("NUST");
    expect(displayName({ name: "Hims", short_name: " " })).toBe("Hims");
  });
  it("aliases from a comma list", () => {
    expect(
      parseAliases("PUCIT, FCIT, pucit,, Faculty of Computing", "Faculty of Computing", "FCIT"),
    ).toEqual(["PUCIT"]);
    expect(aliasesText(["PUCIT", "FCIT"])).toBe("PUCIT, FCIT");
  });
  it("short name to save", () => {
    expect(shortNameValue(" NUST ", "National University of Sciences and Technology")).toBe("NUST");
    expect(shortNameValue("hims", "Hims")).toBeNull();
    expect(shortNameValue("", "Hims")).toBeNull();
  });
});
