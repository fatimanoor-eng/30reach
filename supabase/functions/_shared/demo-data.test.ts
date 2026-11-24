import { describe, expect, it } from "vitest";
import { demoData, DEMO_CLIENT, seeded } from "./demo-data";

const NOW = new Date("2026-11-25T15:00:00Z");

describe("demo client data (Slice 17f)", () => {
  const d = demoData(NOW);

  it("is the same every time for the same day (seeded)", () => {
    expect(demoData(NOW)).toEqual(d);
    expect(seeded(1)()).toBe(seeded(1)());
  });

  it("is clearly made up: demo flag, example.com, .demo handles", () => {
    expect(DEMO_CLIENT.is_demo).toBe(true);
    expect(DEMO_CLIENT.website).toBe("https://example.com");
    expect(d.competitors).toHaveLength(5);
    for (const c of d.competitors) expect(c.instagram_handle).toMatch(/\.demo$/);
    for (const p of d.posts) expect(p.url).toMatch(/^https:\/\/example\.com\/demo\//);
  });

  it("two saved pulls relative to today; each has its own 30 days of posts", () => {
    expect(d.pulls.map((p) => p.started_at)).toEqual([
      "2026-11-17T15:00:00.000Z",
      "2026-11-24T15:00:00.000Z",
    ]);
    for (const pull of d.pulls) {
      const mine = d.posts.filter((p) => p.pull === pull.key);
      expect(mine.length).toBeGreaterThan(20);
      const end = Date.parse(pull.started_at);
      for (const p of mine) {
        expect(Date.parse(p.posted_at)).toBeLessThanOrEqual(end);
        expect(Date.parse(p.posted_at)).toBeGreaterThan(end - 30 * 86_400_000);
      }
    }
  });

  it("the latest pull has posts the previous didn't (What's new)", () => {
    const prev = new Set(d.posts.filter((p) => p.pull === "previous").map((p) => p.external_id));
    const fresh = d.posts.filter((p) => p.pull === "latest" && !prev.has(p.external_id));
    expect(fresh.length).toBeGreaterThan(0);
  });

  it("numbers make sense: views only on videos / reels, shares only on TikTok", () => {
    for (const p of d.posts) {
      expect(p.likes).toBeGreaterThan(0);
      expect(p.views === null).toBe(!(p.format === "reel" || p.format === "video"));
      expect(p.shares === null).toBe(p.platform === "instagram");
    }
  });

  it("ideas and calendar cards around today", () => {
    expect(d.ideas).toHaveLength(6);
    expect(d.cards.map((c) => c.date)).toContain("2026-11-26");
    expect(d.cards.filter((c) => c.status === "posted").every((c) => c.date < "2026-11-25")).toBe(
      true,
    );
  });
});
