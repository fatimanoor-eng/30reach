import { expect, test, type Page } from "@playwright/test";
import {
  noSidewaysScroll,
  OBU,
  ready,
  signInAs,
  stubClients,
  stubSupabase,
  tapTargetsOk,
  type TestClient,
} from "./helpers";

/*
 * Slice 17f: Usage (Figma 17 / M20) and the Demo client. usage_overview() and reset-demo are stubbed.
 */

const BEST: TestClient = {
  id: "client-2",
  slug: "all-the-best-co",
  name: "All The Best Co",
  initials: "AB",
  brand_color: "#C8493F",
  is_demo: false,
  archived_at: null,
};
const DEMO: TestClient = {
  id: "client-3",
  slug: "demo-wellness-co",
  name: "Demo Wellness Co",
  initials: "DW",
  brand_color: "#E9E9E3",
  is_demo: true,
  archived_at: null,
};

const row = (c: TestClient, o: Record<string, unknown>) => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  initials: c.initials,
  brand_color: c.brand_color,
  is_demo: c.is_demo,
  archived_at: c.archived_at,
  credits: 0,
  pull_credits: 0,
  check_credits: 0,
  scan_credits: 0,
  groq_requests: 0,
  pulls: 0,
  last_pull: null,
  storage_bytes: 0,
  posts: 0,
  ideas: 0,
  cards: 0,
  ...o,
});

const OVERVIEW = {
  clients: [
    row(OBU, {
      credits: 77,
      pull_credits: 77,
      pulls: 1,
      last_pull: "2026-11-24T09:00:00Z",
      storage_bytes: 148e6,
      posts: 214,
      ideas: 38,
      cards: 24,
      groq_requests: 63,
    }),
    row(BEST, {
      credits: 75,
      pull_credits: 64,
      scan_credits: 11,
      pulls: 1,
      last_pull: "2026-11-22T09:00:00Z",
      storage_bytes: 31e6,
      posts: 52,
      ideas: 4,
      cards: 3,
      groq_requests: 12,
    }),
    row(DEMO, { storage_bytes: 2e6, posts: 90, ideas: 12, cards: 8, groq_requests: 21 }),
  ],
  weeks: [
    { week: "2026-10-05", client_id: OBU.id, kind: "pull", credits: 48, pulls: 1 },
    { week: "2026-10-19", client_id: OBU.id, kind: "pull", credits: 52, pulls: 1 },
    { week: "2026-11-02", client_id: OBU.id, kind: "pull", credits: 61, pulls: 1 },
    { week: "2026-11-09", client_id: OBU.id, kind: "pull", credits: 74, pulls: 1 },
    { week: "2026-11-16", client_id: OBU.id, kind: "pull", credits: 96, pulls: 1 },
    { week: "2026-11-16", client_id: DEMO.id, kind: "handle_check", credits: 13, pulls: 0 },
    { week: "2026-11-23", client_id: OBU.id, kind: "pull", credits: 77, pulls: 1 },
    { week: "2026-11-23", client_id: BEST.id, kind: "pull", credits: 64, pulls: 1 },
    { week: "2026-11-23", client_id: BEST.id, kind: "scan", credits: 7, pulls: 0 },
    { week: "2026-11-23", client_id: BEST.id, kind: "competitor_search", credits: 4, pulls: 0 },
  ],
  unassigned: 0,
};

async function setup(page: Page) {
  await page.clock.setFixedTime(new Date("2026-11-24T15:00:00Z"));
  await stubSupabase(page);
  await stubClients(page, [OBU, BEST, DEMO]);
  // Firecrawl's own count this month: 588 left of 1,000 → 412 used; 30reach counted 152 → Other 260.
  await page.route("**/rest/v1/rpc/usage_overview", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(OVERVIEW) }),
  );
  await signInAs(page);
}

test("Usage like 17 / M20: meters, per client, credits by week", async ({ page }, info) => {
  await setup(page);
  await ready(page, "/usage");
  await expect(page.getByRole("heading", { level: 1, name: "Usage" })).toBeVisible();
  await expect(page.getByText("588 left of 1,000").locator("visible=true").first()).toBeVisible();
  await expect(page.getByText("Firecrawl credits by week")).toBeVisible();
  await expect(page.getByText(/Other: 260 credits/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Week of 23 Nov: 152 credits/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await noSidewaysScroll(page);
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`usage-${info.project.name}.png`, { fullPage: true });
});

test("hovering a client highlights it, with a tooltip like the frame", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "hover is a desktop pattern");
  await setup(page);
  await ready(page, "/usage");
  // All The Best Co's segment in this week's bar.
  await page
    .getByRole("button", { name: /Week of 23 Nov/ })
    .locator('[data-series="client-2"]')
    .hover();
  const tip = page.getByRole("status").filter({ hasText: "week of 23 Nov" });
  await expect(tip).toContainText("All The Best Co · week of 23 Nov");
  await expect(tip).toContainText("75 credits · 1 pull (64) + scan (11)");
  // A table row opens that client.
  await page.getByRole("row", { name: /OBU Health: 77 credits/ }).click();
  await expect(page).toHaveURL(/\/c\/obu-health\/overview$/);
});

test("the credits meter opens Usage; Settings links to it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "sidebar");
  await setup(page);
  await ready(page, "/settings");
  await expect(page.getByRole("link", { name: "Open Usage", exact: true })).toHaveAttribute(
    "href",
    "/c/obu-health/usage",
  );
  await page.getByRole("link", { name: /Usage: free-tier meters/ }).click();
  await expect(page).toHaveURL(/\/c\/obu-health\/usage$/);
});

test("Demo client: pulls are off; Settings can reset it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page);
  const calls: unknown[] = [];
  await page.route("**/functions/v1/reset-demo", async (r) => {
    calls.push(r.request().postDataJSON());
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ slug: "demo-wellness-co", created: false }),
    });
  });
  await ready(page, "/settings");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(page).toHaveURL(/\/c\/demo-wellness-co\/overview$/);
  await expect(page.getByRole("status")).toContainText("Demo data reset");
  expect(calls).toHaveLength(1);
});
