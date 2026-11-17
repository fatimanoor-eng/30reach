import { describe, expect, it } from "vitest";
import { compareColor, isBlocked, selectionMode, toggleBrand } from "./brand-selection";

describe("brand selection rules", () => {
  it("starts as All brands", () => {
    expect(selectionMode([])).toBe("all");
  });

  it("one pill = single brand, two or three = compare", () => {
    expect(selectionMode(["hims"])).toBe("single");
    expect(selectionMode(["hims", "ro"])).toBe("compare");
    expect(selectionMode(["hims", "ro", "hers"])).toBe("compare");
  });

  it("clicking a lit pill removes it", () => {
    expect(toggleBrand(["hims", "ro"], "hims")).toEqual(["ro"]);
  });

  it("blocks a 4th brand and returns the same selection", () => {
    const three = ["hims", "ro", "hers"];
    expect(toggleBrand(three, "found")).toBe(three);
    expect(isBlocked(three, "found")).toBe(true);
    expect(isBlocked(three, "ro")).toBe(false);
  });

  it("assigns compare colours in selection order: ink, pop, blue", () => {
    const sel = ["ro", "hims", "hers"];
    expect(compareColor(sel, "ro")).toBe("ink");
    expect(compareColor(sel, "hims")).toBe("pop");
    expect(compareColor(sel, "hers")).toBe("blue");
    expect(compareColor(sel, "found")).toBeNull();
  });

  it("removing the 1st brand moves the others up a colour", () => {
    const sel = toggleBrand(["ro", "hims"], "ro");
    expect(compareColor(sel, "hims")).toBe("ink");
  });
});
