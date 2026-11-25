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
 * Slice 17b: the client is in the URL (/c/{slug}/…) and the switcher changes it.
 * Figma 15a (desktop menu), M13 (phone sheet); tablet = the same menu next to the rail.
 */

const NOW = new Date("2026-11-24T12:00:00Z");
const BEST: TestClient = {
  id: "client-2",
  slug: "all-the-best-co",
  name: "All The Best Co",
  initials: "AB",
  brand_color: "#D2473A",
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
const OLD: TestClient = {
  id: "client-4",
  slug: "aardvark-labs",
  name: "Aardvark Labs",
  initials: "AL",
  brand_color: null,
  is_demo: false,
  archived_at: "2026-11-01T00:00:00Z",
};

/** Last real pulls: OBU today, All The Best Co 2 days ago. Other pull queries: nothing saved. */
async function stubPulls(page: Page) {
  await page.route("**/rest/v1/pulls**", (route) => {
    const url = new URL(route.request().url());
    const perClient = url.searchParams.get("select") === "client_id,started_at";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        perClient
          ? [
              { client_id: OBU.id, started_at: "2026-11-24T09:00:00Z" },
              { client_id: BEST.id, started_at: "2026-11-22T09:00:00Z" },
            ]
          : null,
      ),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await stubSupabase(page);
  await stubClients(page, [OBU, BEST, DEMO, OLD]);
  await stubPulls(page);
  // Nothing remembered in this browser (Pick a client tests); the other tests open /c/… or set the profile.
  await signInAs(page, { lastClient: null });
});

/** The switcher's trigger at this size (sidebar card, rail mark or app-bar pill). */
function trigger(page: Page) {
  return page.getByRole("button", { name: /^Client: .*\. Switch client$/ }).locator("visible=true");
}

test("old links go to your last client, keeping the page and its query", async ({ page }) => {
  await page.route("**/rest/v1/profiles**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ role: "admin", full_name: "Fatima Noor", last_client_id: BEST.id }]),
    }),
  );
  await page.goto("/competitors?edit=c-ro"); // an old link, without the client
  await expect(page).toHaveURL(/\/c\/all-the-best-co\/competitors\?edit=c-ro$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/c\/all-the-best-co\/overview$/);
});

// ───────────── Pick a client (17h): only when there's no last client to open

const pickHeading = (page: Page) => page.getByRole("heading", { name: "Pick a client", level: 1 });

test("Pick a client — a first visit picks, saves and opens that client's Overview", async ({
  page,
}, info) => {
  const remembered: unknown[] = [];
  await page.route("**/rest/v1/rpc/set_last_client", async (route) => {
    remembered.push(route.request().postDataJSON());
    await route.fulfill({ status: 204, body: "" });
  });
  await ready(page, "/");
  await expect(pickHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/); // nothing guessed: no A–Z client opened
  await expect(
    page.getByText("Choose who you’re working on. You can switch any time from the client menu."),
  ).toBeVisible();
  const list = page.getByRole("list", { name: "Clients" });
  await expect(list.getByRole("link")).toHaveText([
    /All The Best Co.*2 days ago/,
    /Demo Wellness Co.*Demo/i,
    /OBU Health.*Today/,
  ]);
  // Archived clients aren't offered; fewer than 6 clients → no search.
  await expect(page.getByText("Aardvark Labs")).toHaveCount(0);
  await expect(page.getByPlaceholder("Search clients")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add client" })).toHaveAttribute(
    "href",
    "/add-client",
  );
  await noSidewaysScroll(page);
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await expect(page).toHaveScreenshot("pick-client.png", { fullPage: true });

  await list.getByRole("link", { name: /All The Best Co/ }).click();
  await expect(page).toHaveURL(/\/c\/all-the-best-co\/overview$/);
  await expect.poll(() => remembered).toContainEqual({ p_client: BEST.id });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("30reach:last-client")))
    .toBe("all-the-best-co");
});

test("Pick a client — archived last client is named; an old link keeps its page", async ({
  page,
}) => {
  await page.route("**/rest/v1/profiles**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ role: "admin", full_name: "Fatima Noor", last_client_id: OLD.id }]),
    }),
  );
  // A raw old link (ready() would put OBU's /c/… in front of it).
  await page.goto("/calendar?date=2026-12-04");
  await expect(pickHeading(page)).toBeVisible();
  await expect(
    page.getByText("Aardvark Labs is archived. Choose another client to carry on."),
  ).toBeVisible();
  await page.getByRole("link", { name: /OBU Health/ }).click();
  await expect(page).toHaveURL(/\/c\/obu-health\/calendar\?date=2026-12-04$/);
});

test("Pick a client — a deleted last client, and search from 6 clients", async ({ page }) => {
  const more = ["Bluebird", "Cedar Dental", "Elm Pharmacy"].map((name, i): TestClient => ({
    ...BEST,
    id: `client-x${i}`,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    initials: null,
    brand_color: null,
  }));
  await stubClients(page, [OBU, BEST, DEMO, ...more]);
  await page.route("**/rest/v1/profiles**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      // A client that no longer exists: same as a first visit.
      body: JSON.stringify([{ role: "admin", full_name: "Fatima Noor", last_client_id: "gone" }]),
    }),
  );
  await ready(page, "/");
  await expect(pickHeading(page)).toBeVisible();
  await expect(page.getByText(/Choose who you’re working on/)).toBeVisible();
  const search = page.getByPlaceholder("Search clients");
  await search.fill("dent");
  await expect(page.getByRole("link", { name: /Cedar Dental/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /All The Best Co/ })).toHaveCount(0);
});

test("returning users never see the picker (last client opens straight away)", async ({ page }) => {
  await page.route("**/rest/v1/profiles**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ role: "admin", full_name: "Fatima Noor", last_client_id: OBU.id }]),
    }),
  );
  await ready(page, "/");
  await expect(page).toHaveURL(/\/c\/obu-health\/overview$/);
  await expect(pickHeading(page)).toHaveCount(0);
});

test("switching keeps the page, drops its query and remembers the client", async ({ page }) => {
  const remembered: unknown[] = [];
  await page.route("**/rest/v1/rpc/set_last_client", async (route) => {
    remembered.push(route.request().postDataJSON());
    await route.fulfill({ status: 204, body: "" });
  });
  await ready(page, "/c/obu-health/calendar?date=2026-12-04");
  await trigger(page).click();
  await page.getByRole("link", { name: /Demo Wellness Co/ }).click();
  await expect(page).toHaveURL(/\/c\/demo-wellness-co\/calendar$/);
  await expect(trigger(page)).toHaveAccessibleName("Client: Demo Wellness Co. Switch client");
  // Saved after the switch (the RPC is async): poll rather than read once.
  await expect.poll(() => remembered).toContainEqual({ p_client: DEMO.id });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("30reach:last-client")))
    .toBe("demo-wellness-co");
});

test("an unknown client shows Client not found", async ({ page }) => {
  await page.goto("/c/nobody/overview");
  await expect(page.getByRole("heading", { name: "Client not found" })).toBeVisible();
});

test("the switcher at each size (15a / M13)", async ({ page }, info) => {
  await ready(page, "/c/obu-health/overview");
  await trigger(page).click();
  const mobile = info.project.name === "mobile-390";
  const menu = mobile
    ? page.getByRole("dialog", { name: "Clients" })
    : page.getByRole("group", { name: "Switch client" });
  await expect(menu).toBeVisible();

  // Current first (✓), then A–Z; archived left out; DEMO tag; last pull meta.
  const rows = menu.getByRole("list", { name: "Clients" }).getByRole("link");
  await expect(rows).toHaveText([
    /OBU Health\s*(Pulled today|Today)/,
    /All The Best Co\s*2 days ago/,
    /Demo Wellness Co\s*Demo/,
  ]);
  await expect(rows.first()).toHaveAttribute("aria-current", "true");
  await expect(menu.getByText("Aardvark Labs")).toBeHidden(); // archived: under Archived (1), closed
  await expect(menu.getByRole("button", { name: /Archived\s*1/ })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Add client" })).toHaveAttribute(
    "href",
    "/add-client",
  );
  await expect(menu.getByRole("link", { name: "OBU Health settings" })).toHaveAttribute(
    "href",
    "/c/obu-health/client-settings",
  );

  await noSidewaysScroll(page);
  if (mobile) {
    await page.waitForTimeout(400); // sheet slide-in
    await tapTargetsOk(page);
  }
  await expect(page).toHaveScreenshot("switcher-open.png");

  // Esc closes and (desktop / tablet) puts focus back on the trigger.
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  if (!mobile) await expect(trigger(page)).toBeFocused();
});

test("search shows from 6 clients and filters by name", async ({ page }) => {
  const more = ["Bluebird", "Cedar Dental", "Elm Pharmacy"].map((name, i): TestClient => ({
    ...BEST,
    id: `client-x${i}`,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    initials: null,
    brand_color: null,
  }));
  await stubClients(page, [OBU, BEST, DEMO, ...more]);
  await ready(page, "/c/obu-health/overview");
  await trigger(page).click();
  const search = page.getByPlaceholder("Search clients").locator("visible=true");
  await search.fill("dent");
  await expect(page.getByRole("link", { name: /Cedar Dental/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /All The Best Co/ })).toHaveCount(0);
  await search.fill("zzz");
  await expect(page.getByText("No clients match “zzz”.")).toBeVisible();
});

test("only tracked platforms show in the sidebar and switch", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "sidebar only");
  // LinkedIn switched off by the team: Hims has a LinkedIn page, but the client doesn't track it.
  await page.route("**/rest/v1/client_platforms**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { platform: "instagram", state: "on" },
        { platform: "tiktok", state: "on" },
        { platform: "linkedin", state: "off" },
        { platform: "x", state: "on" },
      ]),
    }),
  );
  await ready(page, "/c/obu-health/overview");
  const nav = page.getByRole("complementary", { name: "Sidebar" }).getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Instagram" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "LinkedIn" })).toHaveCount(0);
});
