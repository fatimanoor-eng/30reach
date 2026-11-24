import { expect, test, type Page, type Route } from "@playwright/test";
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
 * Slice 17c: Client settings (16 / M19), archive (16b), Archived in the switcher (16c), permanent delete
 * (16d) and the manual Add client (15f without the error).
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
  website: "https://all-the-best.co",
};
const NORTHWIND: TestClient = {
  id: "client-9",
  slug: "northwind-clinic",
  name: "Northwind Clinic",
  initials: "NC",
  brand_color: "#3457BA",
  is_demo: false,
  archived_at: "2026-11-21T10:00:00Z",
  archived_by: "00000000-0000-4000-8000-000000000001",
};

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

type Call = { method: string; url: string; body: unknown };
/** Records writes to the clients / client_platforms tables (the stub answers them). */
async function recordWrites(page: Page) {
  const calls: Call[] = [];
  const record = async (route: Route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") return route.fallback();
    calls.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
    return route.fallback();
  };
  await page.route("**/rest/v1/clients**", record);
  await page.route("**/rest/v1/client_platforms**", record);
  return calls;
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await stubSupabase(page);
  await stubClients(page, [OBU, BEST, NORTHWIND]);
  await signInAs(page);
});

test("Client settings like 16 / M19", async ({ page }, info) => {
  await ready(page, "/client-settings");
  await expect(page.getByRole("heading", { level: 1, name: "Client settings" })).toBeVisible();
  // Brand
  await expect(page.getByText("obuhealth.com").first()).toBeVisible();
  await expect(page.getByText("United States · English")).toBeVisible();
  await expect(page.getByText("None · initials shown on ink")).toBeVisible();
  // Platforms: website = ALWAYS ON (no toggle); team = toggle; unsupported = COMING LATER.
  const platforms = page
    .getByRole("region", { name: "Platforms" })
    .or(page.locator("section").filter({ has: page.getByRole("heading", { name: "Platforms" }) }));
  await expect(platforms.getByText("Always on")).toHaveCount(2); // Instagram, TikTok
  await expect(platforms.getByRole("switch")).toHaveCount(2); // LinkedIn, Facebook
  await expect(platforms.getByText("Coming later")).toHaveCount(3); // X, Pinterest, YouTube
  await expect(platforms.getByRole("switch", { name: "Track Instagram" })).toHaveCount(0);
  // Checks come from the regulated topics (code, not the model).
  await expect(page.getByText("Health claims · on")).toBeVisible();
  await expect(page.getByText("Finance · off")).toBeVisible();
  await expect(page.getByText("“US board-certified doctors” · from the site")).toBeVisible();

  await noSidewaysScroll(page);
  if (isMobile(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`client-settings-${info.project.name}.png`, {
    fullPage: true,
  });
});

test("team platforms switch on / off; rules and topics save", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  const calls = await recordWrites(page);
  await ready(page, "/client-settings");
  await page.getByRole("switch", { name: "Track LinkedIn" }).click();
  await expect
    .poll(() => calls.find((c) => c.url.includes("client_platforms"))?.body)
    .toEqual({
      client_id: OBU.id,
      platform: "linkedin",
      state: "off",
      source: "team",
    });

  // Add a team rule.
  await page.getByRole("button", { name: "+ Add a rule" }).click();
  await page.getByLabel("Rule", { exact: true }).fill("No prices in captions");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect
    .poll(() => {
      const patch = calls.filter((c) => c.method === "PATCH").at(-1)?.body as
        { content_rules?: { rule: string; source: string; added_by_name: string }[] } | undefined;
      return patch?.content_rules?.at(-1);
    })
    .toMatchObject({ rule: "No prices in captions", source: "team", added_by_name: "Fatima" });

  // Regulated topics: adding finance turns the finance check on (decided by code).
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByRole("checkbox", { name: "finance" }).click();
  await expect
    .poll(
      () =>
        (calls.filter((c) => c.method === "PATCH").at(-1)?.body as { regulated?: string[] })
          ?.regulated,
    )
    .toEqual(["health", "medical claims", "weight loss", "pharma", "finance"]);
});

test("Edit brand: name, website taken by another client, colour", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  const calls = await recordWrites(page);
  await ready(page, "/client-settings");
  await page.getByRole("button", { name: "Edit brand" }).click();
  const drawer = page.getByRole("dialog", { name: "Edit brand" });
  await drawer.getByLabel("Website").fill("www.all-the-best.co/shop");
  await expect(drawer.getByText("All The Best Co already uses all-the-best.co.")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Save" })).toBeDisabled();
  await drawer.getByLabel("Website").fill("obuhealth.com");
  await drawer.getByRole("textbox", { name: "Brand colour" }).fill("#12ab9");
  await expect(drawer.getByText("Use a hex colour like #C8493F.")).toBeVisible();
  await drawer.getByRole("textbox", { name: "Brand colour" }).fill("#12ab90");
  await drawer.getByLabel("Name").fill("OBU Health Co");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer).toBeHidden();
  expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({
    name: "OBU Health Co",
    website: "https://obuhealth.com",
    brand_color: "#12AB90",
    country: "US",
  });
});

test("archive (16b): confirm, land on the next client, Undo restores", async ({ page }, info) => {
  const calls = await recordWrites(page);
  await ready(page, "/client-settings");
  // Same scroll position every run, so the page behind the dialog / sheet doesn't shift: wait until
  // every card has loaded (the page grows as they do), then scroll to the bottom.
  await expect(page.getByText("6 brands · Instagram, TikTok, LinkedIn")).toBeVisible();
  await expect(page.getByText("Coming later").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole("button", { name: "Archive client" }).click();
  const dialog = page.getByRole("dialog", { name: "Archive OBU Health?" });
  await expect(dialog).toContainText("Posts, ideas, calendar cards and settings are kept.");
  await page.waitForTimeout(300);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`client-archive-${info.project.name}.png`);
  if (info.project.name !== "desktop-1440") return;

  await dialog.getByRole("button", { name: "Archive" }).click();
  await expect(page).toHaveURL(/\/c\/all-the-best-co\/overview$/);
  const toast = page.getByRole("status");
  await expect(toast).toContainText("OBU Health archived");
  expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({
    archived_by: "00000000-0000-4000-8000-000000000001",
  });
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page).toHaveURL(/\/c\/obu-health\/overview$/);
  expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({
    archived_at: null,
    archived_by: null,
  });
});

test("archived clients (16c): listed in the switcher, Restore, links redirect", async ({
  page,
}, info) => {
  // Who archived it: profiles by id ("· Fatima").
  await page.route("**/rest/v1/profiles**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "00000000-0000-4000-8000-000000000001",
          role: "admin",
          full_name: "Fatima Noor",
          email: "fatima.noor@breakthirty.com",
        },
      ]),
    }),
  );
  await ready(page, "/overview");
  const trigger = page
    .getByRole("button", { name: /^Client: .*\. Switch client$/ })
    .locator("visible=true");
  await trigger.click();
  const menu = isMobile(page)
    ? page.getByRole("dialog", { name: "Clients" })
    : page.getByRole("group", { name: "Switch client" });
  await menu.getByRole("button", { name: /Archived\s*1/ }).click();
  const archived = menu.getByRole("list", { name: "Archived clients" });
  await expect(archived).toContainText("Northwind Clinic");
  await expect(archived).toContainText("Archived 3 days ago · Fatima");
  await expect(archived.getByRole("button", { name: "Restore" })).toBeVisible();
  await expect(archived.getByRole("button", { name: "Delete permanently…" })).toBeVisible();
  await page.waitForTimeout(300);
  await noSidewaysScroll(page);
  if (isMobile(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`switcher-archived-${info.project.name}.png`);
  if (info.project.name !== "desktop-1440") return;

  // An archived client's link goes to your last active client, saying why.
  await page.goto("/c/northwind-clinic/calendar");
  await expect(page).toHaveURL(/\/c\/obu-health\/calendar$/);
  await expect(page.getByRole("status")).toContainText("Northwind Clinic is archived.");
});

test("delete permanently (16d): type the name, counts, delete-client", async ({ page }, info) => {
  // What it deletes: HEAD …?count=exact per table.
  for (const [table, n] of [
    ["competitors", 6],
    ["pulls", 2],
    ["posts", 214],
    ["ideas", 38],
    ["calendar_cards", 12],
  ] as const) {
    await page.route(`**/rest/v1/${table}**`, (route) =>
      route.request().method() === "HEAD"
        ? route.fulfill({
            status: 200,
            headers: {
              "content-range": `*/${n}`,
              "access-control-expose-headers": "Content-Range",
              "access-control-allow-origin": "*",
            },
            body: "",
          })
        : route.fallback(),
    );
  }
  const bodies: unknown[] = [];
  await page.route("**/functions/v1/delete-client", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ deleted: true, name: "Northwind Clinic" }),
    });
  });
  await ready(page, "/overview");
  await page
    .getByRole("button", { name: /^Client: .*\. Switch client$/ })
    .locator("visible=true")
    .click();
  await page
    .getByRole("button", { name: /Archived\s*1/ })
    .locator("visible=true")
    .click();
  await page.getByRole("button", { name: "Delete permanently…" }).locator("visible=true").click();
  const dialog = page.getByRole("dialog", { name: "Delete Northwind Clinic permanently?" });
  await expect(dialog).toContainText(
    "This deletes its 6 competitors, 2 saved pulls (214 posts), 38 ideas and 12 calendar cards",
  );
  const confirm = dialog.getByRole("button", { name: "Delete permanently" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type Northwind Clinic to confirm").fill("northwind clinic ");
  await expect(confirm).toBeEnabled();
  await page.waitForTimeout(300);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`client-delete-${info.project.name}.png`);
  if (info.project.name !== "desktop-1440") return;
  await confirm.click();
  await expect(page.getByRole("status")).toContainText("Northwind Clinic deleted.");
  expect(bodies).toEqual([{ clientId: NORTHWIND.id, confirmName: "northwind clinic " }]);
});

test("manual Add client (15f): checks, then the new client's Overview", async ({ page }, info) => {
  const inserted: unknown[] = [];
  await page.route("**/rest/v1/clients**", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fallback();
    inserted.push(req.postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: "client-new", slug: "acme-studio", name: "Acme Studio" }),
    });
  });
  const platforms: unknown[] = [];
  await page.route("**/rest/v1/client_platforms**", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    platforms.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, body: "" });
  });
  await ready(page, "/add-client");
  // 17d: the website step comes first; the manual form is behind "No website?".
  await page.getByRole("button", { name: "No website? Add the details by hand" }).click();
  await expect(page.getByLabel("Name")).toBeFocused();
  await noSidewaysScroll(page);
  if (isMobile(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`add-client-${info.project.name}.png`, { fullPage: true });
  if (info.project.name !== "desktop-1440") return;

  // Required fields, a website another client uses, a bad handle.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("A name is needed.")).toBeVisible();
  await page.getByLabel("Name").fill("Acme Studio");
  await page.getByLabel("Website").fill("https://www.obuhealth.com/");
  await expect(page.getByText("OBU Health already uses obuhealth.com")).toBeVisible();
  await page.getByLabel("Website").fill("acme.studio");
  await page.getByLabel("Instagram").fill("not a handle!");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("Use letters, numbers, dots or underscores (up to 30)."),
  ).toBeVisible();
  await page.getByLabel("Instagram").fill("@AcmeStudio");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/c\/acme-studio\/overview$/);
  expect(inserted[0]).toMatchObject({
    name: "Acme Studio",
    slug: "acme-studio",
    website: "https://acme.studio",
    country: "US",
    language: "en",
  });
  expect(platforms[0]).toEqual([
    {
      platform: "instagram",
      state: "on",
      source: "team",
      account_url: null,
      account_handle: "acmestudio",
      client_id: "client-new",
    },
    {
      platform: "tiktok",
      state: "on",
      source: "team",
      account_url: null,
      account_handle: null,
      client_id: "client-new",
    },
    {
      platform: "linkedin",
      state: "on",
      source: "team",
      account_url: null,
      account_handle: null,
      client_id: "client-new",
    },
    {
      platform: "facebook",
      state: "on",
      source: "team",
      account_url: null,
      account_handle: null,
      client_id: "client-new",
    },
  ]);
});

test("Close asks before leaving a started form", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await ready(page, "/overview");
  await page.goto("/add-client");
  await page.getByRole("button", { name: "No website? Add the details by hand" }).click();
  await page.getByLabel("Name").fill("Half done");
  await page.getByRole("button", { name: "Close" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "Leave Add client?" });
  await expect(dialog).toContainText("Nothing is saved.");
  await dialog.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/c\/obu-health\/overview$/);
});
