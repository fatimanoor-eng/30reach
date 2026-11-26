import { describe, expect, it } from "vitest";
import obu from "./fixtures/site-obuhealth.json";
import carnaby from "./fixtures/site-carnaby.json";
import baskits from "./fixtures/site-baskits.json";
import { fitsSquare, logoCandidates, sizedUrl } from "./logo-logic.ts";

type Page = { branding?: Record<string, unknown>; metadata?: Record<string, unknown> };
const page = (f: unknown) => ((f as { data?: Page }).data ?? (f as Page)) as Page;

describe("competitor logo candidates (24 Nov spike sites)", () => {
  it("OBU: the SVG logo is skipped; the favicon is tried, asked at 256 px", () => {
    const c = logoCandidates(page(obu).branding, page(obu).metadata);
    expect(c.every((x) => !/\.svg/i.test(x.url))).toBe(true);
    expect(c[0]).toMatchObject({ kind: "icon" });
    expect(c[0].url).toContain("Frame_450.png");
  });
  it("Carnaby & Vine and Baskits: logo first, then the favicon, no duplicates", () => {
    for (const f of [carnaby, baskits]) {
      const c = logoCandidates(page(f).branding, page(f).metadata);
      expect(c[0].kind).toBe("logo");
      expect(c.some((x) => x.kind === "icon")).toBe(true);
      expect(new Set(c.map((x) => x.url)).size).toBe(c.length);
    }
  });
  it("Shopify sizes are raised; other URLs are left alone", () => {
    expect(sizedUrl("https://a.com/cdn/shop/files/x.png?crop=center&height=32&width=32")).toBe(
      "https://a.com/cdn/shop/files/x.png?crop=center&height=256&width=256",
    );
    expect(sizedUrl("https://a.com/favicon.png?width=32")).toBe(
      "https://a.com/favicon.png?width=32",
    );
  });
});

describe("fitsSquare", () => {
  it("wide wordmarks are out; square-ish logos and square icons are in", () => {
    expect(fitsSquare(702, 45, "logo")).toBe(false);
    expect(fitsSquare(200, 160, "logo")).toBe(true);
    expect(fitsSquare(180, 180, "icon")).toBe(true);
    expect(fitsSquare(32, 32, "icon")).toBe(false); // too small to scale up
    expect(fitsSquare(300, 200, "icon")).toBe(false);
  });
});
