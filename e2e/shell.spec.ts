import { expect, test } from "@playwright/test";
import { noSidewaysScroll, ready, signInAs, stubSupabase, tapTargetsOk } from "./helpers";

const ROUTES = [
  "/overview",
  "/instagram",
  "/tiktok",
  "/competitors",
  // "/calendar" has its own spec with data (calendar.spec.ts).
  "/ideas",
  "/settings",
  "/more",
  "/dev/components",
];

test.beforeEach(async ({ page }) => {
  await stubSupabase(page);
  await signInAs(page);
});

for (const path of ROUTES) {
  test(`${path} renders and fits`, async ({ page }, info) => {
    await ready(page, path);
    await noSidewaysScroll(page);
    if (info.project.name === "mobile-390") await tapTargetsOk(page);
    await expect(page).toHaveScreenshot(`${path.slice(1).replace("/", "-")}.png`, {
      fullPage: true,
    });
  });
}

test("the right navigation shows at each size", async ({ page }, info) => {
  await ready(page, "/overview");
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  const rail = page.getByRole("complementary", { name: "Navigation rail" });
  const tabs = page.getByRole("navigation", { name: "Main" }).filter({ hasText: "More" });
  if (info.project.name === "mobile-390") {
    await expect(tabs).toBeVisible();
    await expect(sidebar).toBeHidden();
    await expect(rail).toBeHidden();
  } else if (info.project.name === "tablet-768") {
    await expect(tabs).toBeHidden();
    await expect(sidebar).toBeHidden();
    await expect(rail).toBeVisible();
  } else {
    await expect(sidebar).toBeVisible();
    await expect(rail).toBeHidden();
  }
});

test("brand pills: 3 max, selection carries from Instagram to TikTok", async ({ page }, info) => {
  await ready(page, "/instagram");
  const pills = page.getByRole("group", { name: "Brands" });
  for (const name of ["Hims", "Ro", "Hers"])
    await pills.getByRole("button", { name, exact: true }).click();
  await expect(pills.getByRole("button", { name: "Found", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // In-app navigation keeps the shared selection (a full reload would reset it).
  if (info.project.name === "mobile-390") {
    await page.getByRole("radio", { name: "TikTok" }).click(); // Social tab's platform switch
  } else {
    await page.getByRole("link", { name: "TikTok" }).first().click();
  }
  await expect(page).toHaveURL(/\/tiktok$/);
  await expect(pills.getByRole("button", { name: "Hims", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("dialog / sheet and toast", async ({ page }, info) => {
  await ready(page, "/dev/components");

  await page.getByRole("button", { name: "Open responsive dialog" }).click();
  const dialog = page.getByRole("dialog", { name: "Clear saved pull?" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveScreenshot("modal-open.png");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Success toast" }).click();
  await expect(page.getByRole("status")).toContainText("Pull complete");
  await expect(page).toHaveScreenshot("toast.png");

  if (info.project.name === "mobile-390") {
    // The floating Blip button hides while a sheet is open.
    await page.getByRole("button", { name: "Open bottom sheet" }).click();
    await expect(page.getByRole("dialog", { name: "Refresh competitor data?" })).toBeVisible();
    await expect(page.locator("button.fixed[aria-label='Ask Blip']")).toBeHidden();
  }
});

test('"/" opens Ask Blip', async ({ page }) => {
  await ready(page, "/overview");
  await page.keyboard.press("/");
  await expect(page.getByRole("dialog", { name: "Ask Blip" })).toBeVisible();
});
