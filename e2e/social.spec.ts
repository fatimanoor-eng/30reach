import { expect, test, type Page } from "@playwright/test";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk } from "./helpers";
import { BRANDS, makePosts, NOW, solidPng } from "./overview-fixtures";

/*
 * Slice 7 Social pages (06a / 06b / 06c, M05 / M06) with fixed fake data — nothing reaches Supabase
 * or Firecrawl. Clock pinned to 17 Nov 2026 12:00 UTC, timezone UTC.
 */
test.use({ timezoneId: "UTC" });

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const LATEST = { id: "pull-new", started_at: "2026-11-16T16:20:00Z", status: "done" };

async function setup(page: Page, pulls: (typeof LATEST)[] = [LATEST]) {
  await page.clock.setFixedTime(NOW);
  await stubSupabase(page);
  await signInAs(page);
  await page.route("**/rest/v1/competitors**", (r) =>
    r.fulfill(json(BRANDS.map((b) => ({ ...b, instagram_handle: "x", tiktok_handle: "x" })))),
  );
  await page.route("**/rest/v1/pulls**", (r) =>
    r.fulfill(json(r.request().url().includes("status=eq.running") ? null : pulls)),
  );
  // 12 posts per brand so most formats reach the 3-post minimum.
  const posts = makePosts(LATEST.id, new Date(LATEST.started_at), {
    boost: { "c-hims": 1.6 },
    withThumbs: true,
    extraTag: "menopause",
    counts: Object.fromEntries(BRANDS.map((b, i) => [b.id, 12 - i])),
  });
  await page.route("**/rest/v1/posts**", (r) => r.fulfill(json(posts)));
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
      body: solidPng(64, 48, [196, 186, 172]),
    });
  });
}

async function ready(page: Page, path: string) {
  await page.goto(path);
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

const pill = (page: Page, name: string) =>
  page.getByRole("group", { name: "Brands" }).getByRole("button", { name, exact: true });

async function checks(page: Page, mobile: boolean, shot: string) {
  await noSidewaysScroll(page);
  if (mobile) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(shot, { fullPage: true });
}

test("06a / M05 Instagram — all brands", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/instagram");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
    mobile ? /Social/ : /Instagram/,
  );
  if (mobile) {
    await expect(
      page
        .getByRole("radio", { name: /TikTok/ })
        .or(page.getByRole("button", { name: /TikTok/ }))
        .first(),
    ).toBeVisible();
  }
  await expect(page.getByText("Avg engagement").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top posts on Instagram" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formats" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top hashtags" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Best times to post" })).toBeVisible();
  await expect(page.getByText(/Strongest slot across all brands/)).toBeVisible();
  await expect(page.getByText("#glp1").filter({ visible: true }).first()).toBeVisible();

  await checks(page, mobile, "social-instagram.png");

  // Save as idea → Slice 10 toast (after the screenshot: the click scrolls the page).
  await page
    .getByRole("button", { name: "Save as idea" })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByText("Saving ideas arrives in Slice 10")).toBeVisible();
});

test("06a TikTok — views shown, same layout", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/tiktok");
  await expect(page.getByRole("heading", { name: "Top posts on TikTok" })).toBeVisible();
  await expect(page.getByText(/views/).filter({ visible: true }).first()).toBeVisible();
  await checks(page, mobile, "social-tiktok.png");
});

test("06b one brand", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/instagram");
  await pill(page, "Hims").click();
  if (!mobile)
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Hims on Instagram");
  await expect(
    page.getByText(/Strongest slot for Hims|Not enough posts to pick a strongest slot/),
  ).toBeVisible();
  if (!mobile) await expect(page.getByText(/^#\d of \d brands/)).toBeVisible();
  await checks(page, mobile, "social-one-brand.png");
});

test("06c / M06 compare two brands", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/instagram");
  await pill(page, "Hims").click();
  await pill(page, "Ro").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
    mobile ? /Hims vs Ro$/ : /Hims vs Ro on Instagram$/,
  );
  await expect(page.getByRole("heading", { name: "Head to head" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formats, side by side" })).toBeVisible();
  const overlap = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Hashtags: who uses what" }) });
  await expect(overlap.getByText("Both", { exact: true })).toBeVisible();
  await expect(page.getByText("Only Hims")).toBeVisible();
  await expect(page.getByText("Only Ro")).toBeVisible();
  await checks(page, mobile, "social-compare-2.png");
});

test("06c compare three brands", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/instagram");
  for (const b of ["Hims", "Ro", "Hers"]) await pill(page, b).click();
  await expect(page.getByText("Shared", { exact: true })).toBeVisible();
  await expect(page.getByText("Only Hers")).toBeVisible();
  await checks(page, mobile, "social-compare-3.png");
});

test("no pull yet", async ({ page }) => {
  await setup(page, []);
  await ready(page, "/instagram");
  await expect(page.getByText("No Instagram posts yet")).toBeVisible();
  await noSidewaysScroll(page);
});
