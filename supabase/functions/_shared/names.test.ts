import { describe, expect, it } from "vitest";
import {
  cleanAliases,
  cleanShortName,
  displayName,
  namesSystem,
  namesUser,
  validateNames,
} from "./names.ts";
import { alsoCalled } from "./ai-logic.ts";
import { validateProfile } from "./site-logic.ts";

describe("short names and aliases (27 Nov)", () => {
  it("keeps a useful short name only", () => {
    expect(cleanShortName(" NUST ", "National University of Sciences and Technology")).toBe("NUST");
    expect(cleanShortName("Hims", "Hims")).toBe(""); // same as the name
    expect(cleanShortName("x".repeat(30), "Long name")).toBe(""); // too long to be short
    expect(cleanShortName(42, "A")).toBe("");
  });
  it("aliases: distinct, never the name or short name, at most 8", () => {
    expect(
      cleanAliases(
        ["PUCIT", "pucit", "FCIT", "Faculty of Computing", " ", 7],
        "Faculty of Computing",
        "FCIT",
      ),
    ).toEqual(["PUCIT"]);
    expect(
      cleanAliases(
        Array.from({ length: 12 }, (_, i) => `a${i}`),
        "x",
      ),
    ).toHaveLength(8);
  });
  it("displayName prefers the short name", () => {
    expect(displayName({ name: "Beaconhouse National University", short_name: "BNU" })).toBe("BNU");
    expect(displayName({ name: "Hims", short_name: null })).toBe("Hims");
  });
  it("the scan's profile carries them", () => {
    const p = validateProfile(
      {
        name: "Faculty of Computing & Information Technology",
        short_name: "FCIT",
        aliases: ["PUCIT"],
      },
      "",
      "x",
    )!;
    expect(p).toMatchObject({ shortName: "FCIT", aliases: ["PUCIT"] });
  });
  it("Blip's summary lists other names under the label it shows", () => {
    expect(
      alsoCalled([
        { id: "1", name: "National University of Sciences and Technology", short_name: "NUST" },
        { id: "2", name: "Hims", aliases: [] },
        { id: "3", name: "LUMS", aliases: ["Lahore University of Management Sciences"] },
      ]),
    ).toEqual({
      NUST: ["National University of Sciences and Technology"],
      LUMS: ["Lahore University of Management Sciences"],
    });
    expect(alsoCalled([{ id: "2", name: "Hims" }])).toBeNull();
  });
});

describe("suggest-names (backfill, 27 Nov)", () => {
  const items = [
    { name: "Faculty of Computing & Information Technology", website: "https://fcit.example.edu" },
    { name: "National University of Sciences and Technology" },
    { name: "Hims" },
  ];
  it("keeps useful suggestions only, by index", () => {
    const m = validateNames(
      {
        items: [
          { i: 0, short_name: "FCIT", aliases: ["PUCIT", "FCIT"] },
          { i: 1, short_name: "NUST", aliases: [] },
          { i: 2, short_name: "Hims", aliases: [] }, // same as the name: nothing to add
          { i: 9, short_name: "X", aliases: [] }, // no such item
        ],
      },
      items,
    )!;
    expect([...m.entries()]).toEqual([
      [0, { shortName: "FCIT", aliases: ["PUCIT"] }],
      [1, { shortName: "NUST", aliases: [] }],
    ]);
    expect(validateNames({ nope: 1 }, items)).toBeNull();
  });
  it("lists the organisations with their sites, and uses no real client names in the prompt", () => {
    expect(namesUser(items)).toBe(
      "0. Faculty of Computing & Information Technology (fcit.example.edu)\n1. National University of Sciences and Technology\n2. Hims",
    );
    expect(namesSystem()).not.toMatch(/NUST|PUCIT|FCIT/);
  });
});
