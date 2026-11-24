import { expect, test, type Page } from "@playwright/test";
import { OBU, ready, signInAs, stubClients, stubSupabase, type TestClient } from "./helpers";

/*
 * Slice 17e: the calendar follows the client. Holidays and marketing dates for its country; health
 * months only for clients that have them on (health brands).
 */

const BEST: TestClient = {
  id: "client-2",
  slug: "all-the-best-co",
  name: "All The Best Co",
  initials: "AB",
  brand_color: "#C8493F",
  is_demo: false,
  archived_at: null,
  country: "GB",
  health_months: false,
  industry: "Luxury gifting / florist",
};

/** Records which country each holiday read / fetch asked for; serves one holiday per country. */
async function stubHolidays(page: Page) {
  const asked: string[] = [];
  await page.route("**/rest/v1/holiday_cache**", async (r) => {
    const country = new URL(r.request().url()).searchParams.get("country") ?? "";
    asked.push(country);
    const rows =
      country === "eq.GB"
        ? [{ date: "2026-12-26", name: "Boxing Day", global: true }]
        : [{ date: "2026-12-25", name: "Christmas Day", global: true }];
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ data: rows, fetched_at: new Date().toISOString() }]),
    });
  });
  return asked;
}

test.beforeEach(async ({ page }) => {
  await stubSupabase(page);
  await stubClients(page, [OBU, BEST]);
  await page.route("**/rest/v1/calendar_cards**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await signInAs(page);
});

test("a UK gifting client: GB holidays, shared marketing dates, no health months", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile-390", "the toggles row is tablet / desktop");
  const asked = await stubHolidays(page);
  await ready(page, "/c/all-the-best-co/calendar?date=2026-12-10");
  await expect(page.getByText("Boxing Day").first()).toBeVisible();
  expect(asked).toContain("eq.GB");
  await expect(page.getByRole("checkbox", { name: "Holidays" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Health" })).toHaveCount(0);
  // Giving Tuesday is US-only (1 Dec 2026); Christmas Eve is shared.
  await expect(page.getByText("Christmas Eve").first()).toBeVisible();
});

test("OBU keeps US holidays and health months", async ({ page }, info) => {
  test.skip(info.project.name === "mobile-390", "the toggles row is tablet / desktop");
  const asked = await stubHolidays(page);
  await ready(page, "/c/obu-health/calendar?date=2026-12-10");
  await expect(page.getByText("Christmas Day").first()).toBeVisible();
  expect(asked).toContain("eq.US");
  await expect(page.getByRole("checkbox", { name: "Health" })).toBeVisible();
});
