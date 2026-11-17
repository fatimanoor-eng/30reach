import { expect, test } from "@playwright/test";

test("hello page renders in the brand fonts", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);

  // Fonts actually loaded from public/fonts (not a fallback).
  const loaded = await page.evaluate(() => ({
    bdo400: document.fonts.check('400 16px "BDO Grotesk"'),
    bdo500: document.fonts.check('500 16px "BDO Grotesk"'),
    mono: document.fonts.check('11px "Departure Mono"'),
  }));
  expect(loaded).toEqual({ bdo400: true, bdo500: true, mono: true });

  await expect(page.getByRole("img", { name: "30reach" })).toBeVisible();

  // No horizontal scroll at any size.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  await expect(page).toHaveScreenshot("hello.png", { fullPage: true });
});
