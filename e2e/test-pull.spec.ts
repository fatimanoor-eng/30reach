import { expect, test } from "@playwright/test";
import { signInAs, stubSupabase } from "./helpers";

// Dev-only page; one size is enough. Everything is stubbed — 0 Firecrawl credits.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-1440", "checked once at desktop size");
});

test("opening /dev/test-pull only previews — nothing spends credits until confirmed", async ({
  page,
}) => {
  await stubSupabase(page);
  await signInAs(page);

  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/rest/v1/clients**", (r) =>
    r.fulfill(json({ id: "client-1", name: "OBU Health" })),
  );
  await page.route("**/rest/v1/competitors**", (r) =>
    r.fulfill(
      json([
        { id: "c-hers", name: "Hers", instagram_handle: "hers", tiktok_handle: "hers" },
        { id: "c-hims", name: "Hims", instagram_handle: "hims", tiktok_handle: "hims" },
      ]),
    ),
  );
  await page.route("**/rest/v1/pulls**", (r) => r.fulfill(json(null)));

  const startBodies: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/pull-start**", async (r) => {
    startBodies.push(r.request().postDataJSON());
    await r.fulfill(
      json({
        status: "preview",
        estimate: {
          perPlatform: {
            instagram: { tasks: 1, expected: 4, max: 4 },
            tiktok: { tasks: 0, expected: 0, max: 0 },
          },
          expected: 4,
          max: 4,
        },
        credits: { remaining: 996, plan: 1000, periodStart: null, resetsAt: null },
        lastPullAt: null,
        brands: 1,
        pageCap: 2,
        windowDays: 30,
        isTest: true,
      }),
    );
  });

  await page.goto("/dev/test-pull");
  await expect(page.getByText("4 credits (2 pages × 2)")).toBeVisible();
  await expect(page.getByText("@hims")).toBeVisible(); // defaults to Hims Instagram

  const run = page.getByRole("button", { name: "Run test pull (up to 4 credits)" });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(
    page.getByRole("dialog", { name: /Run a test pull for Hims on Instagram/ }),
  ).toBeVisible();

  // Every call so far was a preview of Hims Instagram — no pull was started.
  expect(startBodies.length).toBeGreaterThan(0);
  for (const body of startBodies) {
    expect(body).toMatchObject({
      preview: true,
      test: { competitorId: "c-hims", platform: "instagram" },
    });
  }
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(startBodies.every((b) => b.preview === true)).toBe(true);
});
