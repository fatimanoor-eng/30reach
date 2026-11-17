import { expect, test } from "@playwright/test";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk } from "./helpers";

test.beforeEach(async ({ page }) => {
  await stubSupabase(page);
});

async function settle(page: import("@playwright/test").Page) {
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test("signed out: protected route → 01 / M01 sign in", async ({ page }, info) => {
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/sign-in$/);
  await settle(page);
  await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeEnabled();
  await noSidewaysScroll(page);
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await expect(page).toHaveScreenshot("sign-in.png");
});

test("fresh team sign-in → 01b welcome", async ({ page }) => {
  await signInAs(page, { fresh: true });
  await page.goto("/welcome");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Welcome in, Fatima!" })).toBeVisible();
  await expect(page.getByText("You’re signed in as fatima.noor@breakthirty.com.")).toBeVisible();
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot("welcome.png");

  await page.getByRole("button", { name: "Open 30reach" }).click();
  await expect(page).toHaveURL(/\/overview$/);
});

test("non-team session → 02 wrong account", async ({ page }) => {
  await signInAs(page, { email: "ali.khan@gmail.com", name: "Ali Khan" });
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/wrong-account$/);
  await settle(page);
  await expect(page.getByText(/ali\.khan@gmail\.com isn’t a Breakthirty account/)).toBeVisible();
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot("wrong-account.png");
});

test("hook rejection in the callback URL → 02 with the rejected email", async ({ page }) => {
  await page.goto(
    "/welcome?error=access_denied&error_description=ali.khan%40gmail.com+isn%27t+a+Breakthirty+account.+30reach+only+lets+in+%40breakthirty.com+Google+accounts.",
  );
  await expect(page).toHaveURL(/\/wrong-account$/);
  await expect(page.getByText(/ali\.khan@gmail\.com isn’t a Breakthirty account/)).toBeVisible();
});
