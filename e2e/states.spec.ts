import { expect, test, type Page } from "@playwright/test";
import { signInAs, stubSupabase } from "./helpers";

/*
 * Loading and error states on every page that loads data (Overview, Social, Calendar,
 * Competitors, Ideas) and the credits meter. The request a page waits on is held open (loading)
 * or answered with a 500 (error). Nothing reaches Supabase.
 */
test.use({ timezoneId: "UTC" });

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const PAGES = [
  {
    path: "/overview",
    table: "pulls",
    loading: "Loading the saved pull",
    error: "The saved pull didn’t load",
  },
  {
    path: "/instagram",
    table: "pulls",
    loading: "Loading the saved pull",
    error: "The saved pull didn’t load",
  },
  {
    path: "/calendar?date=2026-12-10",
    table: "calendar_cards",
    loading: "Loading the calendar",
    error: "The calendar didn’t load",
  },
  {
    path: "/competitors",
    table: "competitors",
    loading: "Loading competitors",
    error: "Competitors didn’t load",
  },
  { path: "/ideas", table: "ideas", loading: "Loading ideas", error: "Ideas didn’t load" },
] as const;

async function setup(page: Page, table: string, mode: "hold" | "fail") {
  await stubSupabase(page);
  await signInAs(page);
  // Calendar side requests, answered so nothing leaves the machine.
  await page.route("**/rest/v1/holiday_cache**", (r) => {
    const single = (r.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const row = { data: [], fetched_at: new Date().toISOString() };
    return r.fulfill(json(single ? row : [row]));
  });
  await page.route("**/rest/v1/calendar_cards**", (r) => r.fulfill(json([])));
  // The one this test is about (registered last, so it wins).
  await page.route(`**/rest/v1/${table}**`, (r) =>
    mode === "fail" ? r.fulfill(json({ message: "boom" }, 500)) : undefined,
  );
}

const slug = (path: string) => path.slice(1).split("?")[0];

for (const p of PAGES) {
  test(`${slug(p.path)} — loading skeleton in the page's shape`, async ({ page }, info) => {
    await setup(page, p.table, "hold");
    await page.goto(p.path);
    const skeleton = page.locator(`[aria-busy="true"][aria-label="${p.loading}"]`);
    await expect(skeleton).toBeVisible();
    // Hidden for its first 150 ms, so a quick load never flashes grey.
    expect(await skeleton.evaluate((el) => getComputedStyle(el).animationDelay)).toBe("0.15s");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`loading-${slug(p.path)}-${info.project.name}.png`);
  });

  test(`${slug(p.path)} — load error shows Blip/Error and Try again`, async ({ page }, info) => {
    await setup(page, p.table, "fail");
    await page.goto(p.path);
    const alert = page.getByRole("alert").filter({ hasText: p.error });
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible();
    // Blip/Error has its warning marks (the Idle pose has none): check it's the error pose.
    await expect(alert.locator("svg")).toHaveCount(1);
    await expect(alert.locator('svg path[fill="#F95050"]').first()).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`error-${slug(p.path)}-${info.project.name}.png`);
  });
}

test("skeleton — no pulse with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page, "ideas", "hold");
  await page.goto("/ideas");
  const skeleton = page.locator('[aria-busy="true"][aria-label="Loading ideas"]');
  await expect(skeleton).toBeVisible();
  const bone = skeleton.locator(".bg-soft").first();
  expect(await bone.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("skeleton — pulses normally", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await setup(page, "ideas", "hold");
  await page.goto("/ideas");
  const bone = page
    .locator('[aria-busy="true"][aria-label="Loading ideas"]')
    .locator(".bg-soft")
    .first();
  expect(await bone.evaluate((el) => getComputedStyle(el).animationName)).toBe("pulse");
});

test("credits — load error shows Blip/Error and Retry", async ({ page }, info) => {
  await setup(page, "ideas", "hold");
  await page.route("**/functions/v1/credits**", (r) => r.fulfill(json({ error: "boom" }, 500)));
  const width = page.viewportSize()?.width ?? 0;
  await page.goto(width < 768 ? "/more" : "/ideas");
  if (width >= 768 && width < 1200) {
    // Icon rail: Blip/Error replaces the bar and retries on click.
    const retry = page.getByRole("button", { name: "Couldn't load Firecrawl credits. Retry" });
    await expect(retry).toBeVisible({ timeout: 15_000 });
    await expect(retry.locator('svg path[fill="#F95050"]').first()).toBeAttached();
  } else {
    const line = page
      .locator("p")
      .filter({ hasText: "Couldn’t load credits" })
      .filter({ visible: true });
    await expect(line).toBeVisible({ timeout: 15_000 });
    await expect(line.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(line.locator('svg path[fill="#F95050"]').first()).toBeAttached();
  }
  await expect(page).toHaveScreenshot(`error-credits-${info.project.name}.png`);
});
