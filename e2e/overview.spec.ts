import { expect, test, type Page } from "@playwright/test";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk } from "./helpers";
import { BRANDS, makePosts, NOW, solidPng } from "./overview-fixtures";

/*
 * Slice 6 Overview with fixed fake data — nothing reaches Supabase or Firecrawl.
 * Clock pinned to 17 Nov 2026 12:00 UTC, timezone UTC, so "Last pulled" and stale state are stable.
 */
test.use({ timezoneId: "UTC" });

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const LATEST = { id: "pull-new", started_at: "2026-11-16T16:20:00Z", status: "done" };
const PREVIOUS = { id: "pull-old", started_at: "2026-11-06T10:00:00Z", status: "done" };

async function setup(
  page: Page,
  pulls: (typeof LATEST)[],
  opts: { boost?: Record<string, number> } = {},
) {
  await page.clock.setFixedTime(NOW);
  await stubSupabase(page);
  await signInAs(page);
  await page.route("**/rest/v1/competitors**", (r) => r.fulfill(json(BRANDS)));
  await page.route("**/rest/v1/pulls**", (r) =>
    r.fulfill(json(r.request().url().includes("status=eq.running") ? null : pulls)),
  );
  const postsByPull: Record<string, unknown[]> = {
    // Hims leads now; previously Hers led → "Hims moved up to #1". New posts carry a new prefix.
    [LATEST.id]: makePosts(LATEST.id, new Date(LATEST.started_at), {
      boost: { "c-hims": 1.6, ...opts.boost },
      withThumbs: true,
      extraTag: "menopause", // only in the latest pull → "new tag #menopause"
    }),
    [PREVIOUS.id]: makePosts(PREVIOUS.id, new Date(PREVIOUS.started_at), {
      prefix: "old-",
      boost: { "c-hers": 1.4 },
    }).map((p, i) => (i % 3 === 0 ? { ...p, external_id: p.external_id.replace("old-", "") } : p)),
  };
  await page.route("**/rest/v1/posts**", (r) => {
    const pullId = new URL(r.request().url()).searchParams.get("pull_id")?.replace("eq.", "") ?? "";
    return r.fulfill(json(postsByPull[pullId] ?? []));
  });
  // Thumbnails: POST …/object/sign/post-thumbs creates signed URLs; GET on a signed URL returns the image.
  await page.route("**/storage/v1/object/sign/post-thumbs**", async (r) => {
    if (r.request().method() === "POST") {
      const { paths } = r.request().postDataJSON() as { paths: string[] };
      return r.fulfill(
        json(
          paths.map((path) => ({
            path,
            signedURL: `/object/sign/post-thumbs/${path}?token=test`,
            error: null,
          })),
        ),
      );
    }
    return r.fulfill({
      status: 200,
      contentType: "image/png",
      body: solidPng(48, 60, [196, 186, 172]),
    });
  });
}

async function ready(page: Page, path = "/overview") {
  await page.goto(path);
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test("03 first run (no real pull yet)", async ({ page }, info) => {
  await setup(page, []);
  await ready(page);
  await expect(page.getByRole("heading", { level: 1, name: "Run your first pull" })).toBeVisible();
  await expect(
    page.getByText("6 brands: Found, Hers, Hims, LifeMD, Ro, WeightWatchers"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Pull data now" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review competitors" })).toBeVisible();
  await noSidewaysScroll(page);
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await expect(page).toHaveScreenshot("first-run.png", { fullPage: true });
});

test("04 overview + 05e what's new", async ({ page }, info) => {
  await setup(page, [LATEST, PREVIOUS]);
  await ready(page);

  await expect(page.getByText("Last pulled 16 Nov, 16:20").filter({ visible: true })).toBeVisible();
  const bar = page.getByRole("region", { name: "What's new since the last pull" });
  await expect(bar).toContainText("New since 6 Nov");
  await expect(bar).toContainText("Hims moved up to #1");
  await expect(bar).toContainText("new tag #menopause");
  // KPI label: "Posts tracked" (tablet/desktop) or "Posts" (mobile, M02).
  await expect(
    page
      .getByText(/^Posts( tracked)?$/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  // NEW chip on a top post (desktop list or mobile cards — whichever is visible).
  await expect(
    page.getByText("New", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/SELECTION:/i)).toHaveCount(0);

  await noSidewaysScroll(page);
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await expect(page).toHaveScreenshot("overview.png", { fullPage: true });
});

test("stale data (> 7 days) is amber", async ({ page }) => {
  await setup(page, [{ ...LATEST, id: "pull-new", started_at: "2026-11-07T09:00:00Z" }]);
  await ready(page);
  const stale = page.getByText("Last pulled 7 Nov · 10 days ago").filter({ visible: true });
  await expect(stale).toBeVisible();
  await expect(stale).toHaveCSS("color", "rgb(178, 107, 0)"); // --color-amber-text
  await expect(page.getByRole("region", { name: "What's new since the last pull" })).toHaveCount(0);
  await expect(page).toHaveScreenshot("overview-stale.png");
});

test("compare mode (2 brands) and one brand", async ({ page }, info) => {
  await setup(page, [LATEST]);
  await ready(page);
  const pills = page.getByRole("group", { name: "Brands" });
  await pills.getByRole("button", { name: "Hims", exact: true }).click();
  await expect(page.getByText("Posting rate", { exact: true })).toBeVisible();

  await pills.getByRole("button", { name: "Ro", exact: true }).click();
  await expect(page.getByText("Most active", { exact: true })).toBeVisible();
  if (info.project.name !== "mobile-390") {
    // Captions are hidden on mobile (M02).
    await expect(page.getByText("Across 2 brands, both platforms")).toBeVisible();
  }
  await expect(page).toHaveScreenshot("overview-compare.png", { fullPage: true });
});

test("platform + date range filters, 90 days disabled", async ({ page }, info) => {
  await setup(page, [LATEST]);
  await ready(page);
  await page.getByRole("radio", { name: "TikTok" }).click();
  await expect(page).toHaveURL(/platform=tiktok/);
  await expect(
    page
      .getByText(/views ·/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible(); // TikTok shows views

  if (info.project.name === "mobile-390") {
    const select = page.getByRole("combobox", { name: "Date range" }); // the mobile select
    await select.selectOption("7");
    await expect(page).toHaveURL(/days=7/);
    await expect(select.locator('option[value="90"]')).toBeDisabled();
  } else {
    await page.getByRole("radio", { name: "7 days" }).click();
    await expect(page).toHaveURL(/days=7/);
    const ninety = page.getByRole("radio", { name: "90 days" });
    await expect(ninety).toHaveAttribute("aria-disabled", "true");
    await ninety.hover();
    await expect(
      page.getByRole("tooltip", { name: "Needs a 90-day pull, coming later" }),
    ).toBeVisible();
    await ninety.click({ force: true }); // Playwright waits on aria-disabled; force it to prove nothing happens
    await expect(page).toHaveURL(/days=7/); // unchanged
  }
});

test("dismissing what's new hides it until the next pull", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page, [LATEST, PREVIOUS]);
  await ready(page);
  const bar = page.getByRole("region", { name: "What's new since the last pull" });
  await bar.getByRole("button", { name: "Hide until the next pull" }).click();
  await expect(bar).toHaveCount(0);
  await page.reload();
  await page.locator("h1").first().waitFor();
  await expect(page.getByText("Leaderboard")).toBeVisible();
  await expect(bar).toHaveCount(0);
});

test("Save as idea says coming soon; Open post opens the original", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page, [LATEST]);
  await ready(page);
  await page.getByRole("button", { name: "Save as idea" }).first().click();
  await expect(page.getByRole("status")).toContainText("Saving ideas arrives in Slice 10");
  const open = page.getByRole("link", { name: /Open post/ }).first();
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("href", /^https:\/\/example\.com\//);
});

test("leaderboard row selects that brand's pill", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page, [LATEST]);
  await ready(page);
  await page.getByRole("table").getByRole("button", { name: /Ro$/ }).click();
  await expect(
    page.getByRole("group", { name: "Brands" }).getByRole("button", { name: "Ro", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
