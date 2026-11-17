import { expect, test, type Page } from "@playwright/test";

const ROUTES = [
  "/overview",
  "/instagram",
  "/tiktok",
  "/competitors",
  "/calendar",
  "/ideas",
  "/settings",
  "/more",
  "/dev/components",
];

async function ready(page: Page, path: string) {
  await page.goto(path);
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page scrolls sideways").toBe(0);
}

/** Every visible interactive element on mobile must be at least 44 × 44 px. */
async function tapTargetsOk(page: Page) {
  const small = await page.evaluate(() => {
    const els = document.querySelectorAll<HTMLElement>(
      'a[href], button, [role="radio"], [tabindex="0"]',
    );
    return [...els]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        // Ignore visually hidden elements (e.g. the skip link until it's focused).
        const srOnly = s.clipPath !== "none" || s.clip.startsWith("rect");
        const visible = r.width > 1 && r.height > 1 && s.visibility !== "hidden" && !srOnly;
        return visible && (r.width < 44 || r.height < 44);
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`;
      });
  });
  expect(small, "tap targets smaller than 44 px").toEqual([]);
}

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

test("brand pills: 3 max, selection carries to Instagram", async ({ page }) => {
  await ready(page, "/overview");
  const pills = page.getByRole("group", { name: "Brands" });
  for (const name of ["Hims", "Ro", "Hers"])
    await pills.getByRole("button", { name, exact: true }).click();
  await expect(pills.getByRole("button", { name: "Found", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByText("Selection: Compare Hims vs Ro vs Hers")).toBeVisible();

  await ready(page, "/overview");
  await pills.getByRole("button", { name: "Hims", exact: true }).click();
  await page
    .getByRole("link", { name: /Instagram|Social/ })
    .first()
    .click();
  await expect(page.getByText("Selection: Hims")).toBeVisible();
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
