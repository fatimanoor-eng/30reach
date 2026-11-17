import { describe, expect, it } from "vitest";
import type { Competitor } from "../../lib/useCompetitors";
import {
  competitorStatus,
  duplicateOf,
  handlesToCheck,
  parseHandle,
  suggestInitials,
} from "./competitor-rules";

const comp = (o: Partial<Competitor>): Competitor => ({
  id: "c1",
  name: "Found",
  initials: "Fo",
  instagram_handle: "joinfound",
  tiktok_handle: "joinfound",
  instagram_status: "ok",
  tiktok_status: "ok",
  ...o,
});

describe("suggestInitials (matches the seeded brands)", () => {
  it.each([
    ["WeightWatchers", "WW"],
    ["LifeMD", "LM"],
    ["Hims", "Hi"],
    ["Hers", "He"],
    ["Ro", "Ro"],
    ["Found", "Fo"],
    ["Weight Watchers", "WW"],
    ["noom", "No"],
    ["  ", ""],
    ["X", "X"],
  ])("%s → %s", (name, initials) => expect(suggestInitials(name)).toBe(initials));
});

describe("parseHandle", () => {
  it("accepts @handle, plain handle and profile links; lowercases", () => {
    expect(parseHandle("instagram", "@Noom")).toEqual({ kind: "ok", handle: "noom" });
    expect(parseHandle("instagram", "https://www.instagram.com/ro.co/?hl=en")).toEqual({
      kind: "ok",
      handle: "ro.co",
    });
    expect(parseHandle("tiktok", "tiktok.com/@noomofficial?lang=en")).toEqual({
      kind: "ok",
      handle: "noomofficial",
    });
  });
  it("empty and invalid", () => {
    expect(parseHandle("tiktok", "   ")).toEqual({ kind: "empty" });
    expect(parseHandle("instagram", "no spaces").kind).toBe("invalid");
    expect(parseHandle("tiktok", "a").kind).toBe("invalid");
    expect(parseHandle("instagram", "x".repeat(31)).kind).toBe("invalid");
  });
});

describe("handlesToCheck", () => {
  it("only new or changed, never empty", () => {
    expect(handlesToCheck({}, { instagram: "noom", tiktok: null })).toEqual(["instagram"]);
    expect(
      handlesToCheck(
        { instagram: "noom", tiktok: "noom" },
        { instagram: "noom", tiktok: "noomofficial" },
      ),
    ).toEqual(["tiktok"]);
    expect(
      handlesToCheck({ instagram: "noom", tiktok: "noom" }, { instagram: "noom", tiktok: null }),
    ).toEqual([]); // removing a handle costs nothing
  });
});

describe("duplicateOf", () => {
  it("finds another brand with the same handle, ignoring itself", () => {
    const list = [comp({}), comp({ id: "c2", name: "Ro", instagram_handle: "ro.co" })];
    expect(duplicateOf(list, "instagram", "RO.CO")?.name).toBe("Ro");
    expect(duplicateOf(list, "instagram", "ro.co", "c2")).toBeNull();
  });
});

describe("competitorStatus", () => {
  it("OK when every present handle is ok (missing TikTok is fine)", () => {
    expect(competitorStatus(comp({ tiktok_handle: null, tiktok_status: "unchecked" }))).toEqual({
      label: "OK",
      tone: "ok",
    });
  });
  it("names the platform that wasn't found", () => {
    expect(competitorStatus(comp({ tiktok_status: "not_found" }))).toEqual({
      label: "TikTok not found",
      tone: "danger",
    });
    expect(
      competitorStatus(comp({ tiktok_status: "not_found", instagram_status: "not_found" })).label,
    ).toBe("Not found");
  });
  it("Not checked while any present handle is unchecked", () => {
    expect(competitorStatus(comp({ instagram_status: "unchecked" })).label).toBe("Not checked");
  });
});
