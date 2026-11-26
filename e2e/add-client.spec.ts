import { expect, test, type Page, type Route } from "@playwright/test";
import { noSidewaysScroll, ready, signInAs, stubSupabase, tapTargetsOk } from "./helpers";

/*
 * Slice 17d: Add client from a website (15b–15g, M14–M18). scan-site / suggest-competitors / pull-start
 * are mocked with the 24 Nov spike's All The Best Co results: no credits are spent here.
 */

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const SCAN = {
  status: "ok",
  credits: 1,
  website: "https://all-the-best.co",
  name: "All The Best Co",
  description:
    "Luxury gift boxes and fresh flowers from a studio in Pasadena, CA. Local delivery across Los Angeles, nationwide shipping.",
  country: "US",
  language: "en",
  industry: "Luxury gifting / florist",
  audience: "Gift buyers in Los Angeles",
  regulated: [],
  audienceIsKids: false,
  healthMonths: false,
  rules: [
    {
      id: "blip-1",
      rule: "No health claims about wellness gift boxes",
      why: "Calming or healing claims could read as health claims.",
      quote: "Wellness · gift boxes",
    },
    {
      id: "blip-2",
      rule: "Show prices and discounts clearly",
      why: "Holiday offers must say what’s off and until when.",
      quote: "SHOP THE HOLIDAY COLLECTION NOW!",
    },
  ],
  queries: ["luxury gift boxes Los Angeles", "premium floral delivery Los Angeles"],
  scope: "local",
  color: "#C8493F",
  logoPath: null,
  logoUrl: null,
  accounts: [
    { platform: "instagram", handle: "shop_allthebest", url: null },
    { platform: "facebook", handle: null, url: "https://www.facebook.com/shop.at.atb" },
  ],
};

const SUGGESTIONS = [
  ["Carnaby & Vine", "carnabyandvine.com", "luxury gift boxes"],
  ["Baskits", "baskits.com", "gift baskets, Los Angeles"],
  ["Gourmet Gift 4U", "gourmetgift4u.com", "same-day gifts, LA"],
  ["Jacob Maarse Florist", "jacobmaarse.com", "Pasadena florist"],
  ["Pasadena Floral Design", "pasadenafloraldesign.com", "florist"],
  ["Giften Market", "giftenmarket.com", "gift baskets"],
].map(([name, domain, about]) => ({
  name,
  website: `https://${domain}`,
  domain,
  about,
  why: domain === "carnabyandvine.com" ? "Luxury gift boxes in LA, like yours" : "",
}));

/** Discovery 2.0: "Big in your space" (unticked; followers from one snippet search). */
const BIG = [
  {
    name: "Harry & David",
    website: "https://harryanddavid.com",
    domain: "harryanddavid.com",
    about: "Gift baskets",
    why: "The biggest gift-basket brand on social",
    followers: { platform: "instagram", handle: "harryanddavid", count: 412_000 },
  },
];

const ACCOUNTS: Record<string, { platform: string; handle: string | null; url: string | null }[]> =
  {
    "https://carnabyandvine.com": [
      { platform: "instagram", handle: "carnabyandvine", url: null },
      {
        platform: "facebook",
        handle: null,
        url: "https://www.facebook.com/profile.php?id=100095309165059",
      },
      { platform: "pinterest", handle: "carnabyandvine", url: null },
    ],
    "https://baskits.com": [
      { platform: "instagram", handle: "baskitsinc", url: null },
      { platform: "facebook", handle: null, url: "https://www.facebook.com/baskitsinc1" },
      { platform: "linkedin", handle: null, url: "https://www.linkedin.com/company/baskits-inc/" },
    ],
    "https://gourmetgift4u.com": [
      { platform: "instagram", handle: "gourmetgift4u", url: null },
      { platform: "facebook", handle: null, url: "https://www.facebook.com/gourmetgift4u" },
    ],
    "https://jacobmaarse.com": [
      { platform: "instagram", handle: "jacobmaarseflorist", url: null },
      { platform: "facebook", handle: null, url: "https://www.facebook.com/jacobmaarseflorist" },
    ],
    "https://pasadenafloraldesign.com": [
      { platform: "instagram", handle: "pasadenafloral", url: null },
    ],
    "https://giftenmarket.com": [],
    "https://harryanddavid.com": [
      { platform: "instagram", handle: "harryanddavid", url: null },
      { platform: "tiktok", handle: "harryanddavid", url: null },
    ],
    "https://worthepenny.com": [{ platform: "instagram", handle: "worthepenny", url: null }],
  };

const PREVIEW = {
  status: "preview",
  estimate: {
    perPlatform: {
      instagram: { tasks: 4, expected: 24, max: 32 },
      facebook: { tasks: 4, expected: 16, max: 32 },
    },
    expected: 40,
    max: 64,
  },
  credits: { remaining: 761, plan: 1000, periodStart: null, resetsAt: "2026-12-01T12:00:00Z" },
  lastPullAt: null,
  brands: 4,
  pageCap: 4,
  windowDays: 30,
  isTest: false,
};

type Calls = {
  scans: unknown[];
  suggest: unknown[];
  inserts: Record<string, unknown[]>;
  starts: unknown[];
};

/** Mocks for the whole flow. `hold` keeps suggest-competitors waiting until released (15c mid-state). */
async function stubFlow(page: Page, { unreadable = false, hold = false } = {}) {
  const calls: Calls = { scans: [], suggest: [], inserts: {}, starts: [] };
  let release!: () => void;
  const gate = hold ? new Promise<void>((r) => (release = r)) : Promise.resolve();
  await page.route("**/functions/v1/scan-site", async (r: Route) => {
    const body = r.request().postDataJSON() as { url: string; mode: string; name?: string };
    calls.scans.push(body);
    if (body.mode === "find") {
      // Smart add by hand (Discovery 2.0): a name → its site, accounts and logo (≈ 3 credits).
      return r.fulfill(
        json({
          status: "ok",
          credits: 3,
          name: body.name,
          website: "https://worthepenny.com",
          about: "Coupon codes",
          accounts: ACCOUNTS["https://worthepenny.com"],
          logoPath: null,
          logoUrl: null,
        }),
      );
    }
    if (body.mode === "client") {
      return r.fulfill(
        json(unreadable ? { status: "unreadable", credits: 0, reason: "no_answer" } : SCAN),
      );
    }
    await r.fulfill(json({ status: "ok", credits: 1, accounts: ACCOUNTS[body.url] ?? [] }));
  });
  await page.route("**/functions/v1/suggest-competitors", async (r: Route) => {
    calls.suggest.push(r.request().postDataJSON());
    await gate;
    await r.fulfill(
      json({ suggestions: SUGGESTIONS, big: BIG, credits: 8, searched: SCAN.queries }),
    );
  });
  for (const table of ["clients", "client_platforms", "competitors"]) {
    await page.route(`**/rest/v1/${table}**`, async (r: Route) => {
      if (r.request().method() !== "POST") return r.fallback();
      (calls.inserts[table] ??= []).push(r.request().postDataJSON());
      return table === "clients"
        ? r.fulfill(
            json({ id: "client-new", slug: "all-the-best-co", name: "All The Best Co" }, 201),
          )
        : r.fulfill({ status: 201, body: "" });
    });
  }
  await page.route("**/functions/v1/pull-start**", async (r: Route) => {
    const body = r.request().postDataJSON() as { preview?: boolean };
    calls.starts.push(body);
    await r.fulfill(
      json(body.preview ? PREVIEW : { ...PREVIEW, status: "started", pullId: "pull-new" }),
    );
  });
  return { calls, release: () => release?.() };
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-24T12:00:00Z"));
  await stubSupabase(page);
  await signInAs(page);
});

test("15b / M14 website step: cost up front, bad or taken sites cost nothing", async ({
  page,
}, info) => {
  const { calls } = await stubFlow(page);
  await ready(page, "/add-client");
  await expect(
    page.getByRole("heading", { level: 1, name: "Which client are we adding?" }),
  ).toBeVisible();
  await expect(page.getByText(/About 15–18 Firecrawl credits · 588 left/i)).toBeVisible();
  const field = page.getByLabel("Website");
  await expect(field).toBeFocused();
  await field.fill("all-the-best.co");
  await page.evaluate(() => document.fonts.ready);
  await noSidewaysScroll(page);
  if (isMobile(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`add-website-${info.project.name}.png`);
  if (info.project.name !== "desktop-1440") return;

  await field.fill("not a site");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect(page.getByText("That doesn’t look like a website address.")).toBeVisible();
  await field.fill("https://www.obuhealth.com/plans");
  await expect(page.getByText("OBU Health already uses obuhealth.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan website" })).toBeDisabled();
  expect(calls.scans).toEqual([]);
});

test("15c / M15 scanning checklist, mid-way", async ({ page }, info) => {
  const { release } = await stubFlow(page, { hold: true });
  await ready(page, "/add-client");
  await page.getByLabel("Website").fill("all-the-best.co");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Reading all-the-best.co…" }),
  ).toBeVisible();
  const list = page.getByRole("list", { name: "Scan progress" });
  await expect(list).toContainText("Name · All The Best Co");
  await expect(list).toContainText("Instagram · @shop_allthebest");
  await expect(list).toContainText("Facebook · shop.at.atb");
  await expect(list).toContainText("TikTok, LinkedIn, X");
  await expect(page.getByText(/1 credit used so far/i)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await noSidewaysScroll(page);
  if (isMobile(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`add-scanning-${info.project.name}.png`, {
    mask: [page.locator("[aria-label='In progress']")],
  });
  release();
  await expect(page.getByRole("heading", { level: 1, name: "Review All The Best Co" })).toBeVisible(
    { timeout: 10_000 },
  );
});

test("15d / M16 review, then Create client and 15e first pull", async ({ page }, info) => {
  const { calls } = await stubFlow(page);
  await ready(page, "/add-client");
  await page.getByLabel("Website").fill("all-the-best.co");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Review All The Best Co" })).toBeVisible(
    { timeout: 10_000 },
  );

  // Site links: ALWAYS ON, no toggle; the rest are team toggles.
  await expect(page.getByText("Always on")).toHaveCount(2);
  await expect(page.getByRole("switch", { name: "Track Instagram" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Track TikTok" })).not.toBeChecked();
  // Strongest 4 pre-ticked; Giften Market (no links) isn't.
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(4);
  // Phones show just the domain (M16); tablet / desktop add what they sell (15d). No accounts on its
  // site: "No accounts found · add" (Discovery 2.0).
  await expect(
    page.getByText(isMobile(page) ? "giftenmarket.com" : "giftenmarket.com · gift baskets", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(isMobile(page) ? /None found/ : /No accounts found/)).toBeVisible();
  await expect(page.getByText("“SHOP THE HOLIDAY COLLECTION NOW!” · from the site")).toBeVisible();
  await expect(
    page.getByText(
      isMobile(page)
        ? "4 competitors · 2 platforms"
        : "4 competitors · 2 platforms · first pull is next",
      { exact: false },
    ),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await noSidewaysScroll(page);
  if (isMobile(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`add-review-${info.project.name}.png`, { fullPage: true });
  expect(calls.scans).toHaveLength(7); // the site + 6 competitor home pages

  // Create client → first pull.
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "All The Best Co is ready" }),
  ).toBeVisible();
  await expect(page.getByText(/up to 64 credits/)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await noSidewaysScroll(page);
  if (isMobile(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`add-first-pull-${info.project.name}.png`);
  if (info.project.name !== "desktop-1440") return;

  expect(calls.inserts.clients[0]).toMatchObject({
    name: "All The Best Co",
    slug: "all-the-best-co",
    website: "https://all-the-best.co",
    brand_color: "#C8493F",
    country: "US",
    regulated: [],
  });
  expect(calls.inserts.client_platforms[0]).toEqual([
    {
      platform: "instagram",
      state: "on",
      source: "website",
      account_handle: "shop_allthebest",
      account_url: null,
      client_id: "client-new",
    },
    {
      platform: "facebook",
      state: "on",
      source: "website",
      account_handle: null,
      account_url: "https://www.facebook.com/shop.at.atb",
      client_id: "client-new",
    },
    {
      platform: "tiktok",
      state: "off",
      source: "team",
      account_handle: null,
      account_url: null,
      client_id: "client-new",
    },
    {
      platform: "linkedin",
      state: "off",
      source: "team",
      account_handle: null,
      account_url: null,
      client_id: "client-new",
    },
    {
      // Slice 17g: X is supported → an off team row like LinkedIn.
      platform: "x",
      state: "off",
      source: "team",
      account_handle: null,
      account_url: null,
      client_id: "client-new",
    },
    {
      // Slice 18: YouTube is supported → an off team row too.
      platform: "youtube",
      state: "off",
      source: "team",
      account_handle: null,
      account_url: null,
      client_id: "client-new",
    },
  ]);
  expect((calls.inserts.competitors[0] as { name: string }[]).map((c) => c.name)).toEqual([
    "Carnaby & Vine",
    "Baskits",
    "Gourmet Gift 4U",
    "Jacob Maarse Florist",
  ]);
});

test("15e Later → the new client's Overview with the welcome (15g)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await stubFlow(page);
  await ready(page, "/add-client");
  await page.getByLabel("Website").fill("all-the-best.co");
  await page.getByRole("button", { name: "Scan website" }).click();
  await page.getByRole("button", { name: "Create client" }).click({ timeout: 10_000 });
  await page.getByRole("button", { name: "Later" }).click();
  await expect(page).toHaveURL(/\/c\/all-the-best-co\/overview$/);
  await expect(page.getByRole("status")).toContainText("All The Best Co added");
  await expect(page.getByRole("status")).toContainText(
    "4 competitors · Instagram, Facebook. Press Refresh when you’re ready.",
  );
});

test("a reload mid-flow carries on without scanning again", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  const { calls } = await stubFlow(page);
  await ready(page, "/add-client");
  await page.getByLabel("Website").fill("all-the-best.co");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Review All The Best Co" })).toBeVisible(
    { timeout: 10_000 },
  );
  await page.getByLabel("Name").fill("All The Best Co.");
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("All The Best Co.");
  expect(calls.scans).toHaveLength(7);
  expect(calls.suggest).toHaveLength(1);
});

test("15f / M18 site couldn't be read: nothing charged, manual form + Try again", async ({
  page,
}, info) => {
  await stubFlow(page, { unreadable: true });
  await ready(page, "/add-client");
  await page.getByLabel("Website").fill("all-the-best.co");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "We couldn’t read all-the-best.co" }),
  ).toBeVisible();
  await expect(page.getByText(/Nothing was charged/)).toBeVisible();
  await expect(page.getByLabel("Website")).toHaveValue("all-the-best.co");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await noSidewaysScroll(page);
  if (isMobile(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`add-unreadable-${info.project.name}.png`, {
    fullPage: true,
  });
});

test("Cancel while scanning asks, then goes back to the website step", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await stubFlow(page, { hold: true });
  await ready(page, "/add-client");
  await page.getByLabel("Website").fill("all-the-best.co");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect(page.getByText(/1 credit used so far/i)).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel?" });
  await expect(dialog).toContainText("1 credit was used; nothing is saved.");
  await dialog.getByRole("button", { name: "Cancel scan" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Which client are we adding?" }),
  ).toBeVisible();
});

test("Back on every step after Website keeps what was entered and never scans again (polish)", async ({
  page,
}, info) => {
  const { calls } = await stubFlow(page);
  await ready(page, "/add-client");
  // Step 1 has no Back.
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await page.getByLabel("Website").fill("all-the-best.co");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Review All The Best Co" })).toBeVisible(
    { timeout: 10_000 },
  );
  await page.getByLabel("Name").fill("All The Best Co.");
  // The shell's Back (top bar); Review's own Back stays in its footer.
  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await expect(page.getByLabel("Website")).toHaveValue("all-the-best.co");
  await page.getByRole("button", { name: "Scan website" }).click();
  // Same site: Review again with the edit kept; nothing scanned or charged again.
  await expect(page.getByLabel("Name")).toHaveValue("All The Best Co.");
  expect(calls.scans).toHaveLength(7);
  expect(calls.suggest).toHaveLength(1);
  if (isMobile(page)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  void info;
});

test("Back from the manual form keeps its entries (polish)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await stubFlow(page);
  await ready(page, "/add-client");
  await page.getByRole("button", { name: /No website\?/ }).click();
  await page.getByLabel("Name").fill("Northwind Clinic");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: /No website\?/ }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Northwind Clinic");
});

test("Discovery 2.0 review: Big in your space unticked with followers; ticking reads its site; smart add", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-1440",
    "behaviour check, once (screenshots cover the sizes)",
  );
  const { calls } = await stubFlow(page);
  await ready(page, "/add-client");
  await page.getByLabel("Website").fill("all-the-best.co");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Review All The Best Co" })).toBeVisible(
    { timeout: 10_000 },
  );
  // Rivals first, with their why; the big brand in its own group, unticked, with its followers.
  const rivals = page.getByRole("list", { name: "Closest rivals" });
  await expect(rivals.getByText("Luxury gift boxes in LA, like yours")).toBeVisible();
  const big = page.getByRole("list", { name: "Big in your space" });
  await expect(big.getByText("Harry & David")).toBeVisible();
  await expect(
    big.getByText(/~412K on Instagram · The biggest gift-basket brand on social/),
  ).toBeVisible();
  const harry = big.getByRole("checkbox");
  await expect(harry).not.toBeChecked();
  expect(calls.scans.some((b) => (b as { url: string }).url === "https://harryanddavid.com")).toBe(
    false,
  );
  // A rival without accounts says so, with "add".
  await expect(rivals.getByText(/No accounts found/)).toBeVisible();

  // Ticking it reads its site (1 credit): accounts appear.
  await harry.check();
  await expect
    .poll(() => calls.scans.some((b) => (b as { url: string }).url === "https://harryanddavid.com"))
    .toBe(true);
  await expect(page.getByText("5 COMPETITORS · 2 PLATFORMS · FIRST PULL IS NEXT")).toBeVisible();

  // Smart add by name: Blip finds the site, accounts and logo.
  await page.getByRole("button", { name: "Add another competitor" }).click();
  await page.getByLabel("Name or website").fill("Worth a Penny");
  await expect(page.getByText(/about 3 credits/)).toBeVisible();
  await page.getByRole("button", { name: "Find" }).click();
  await expect(rivals.getByText("Worth a Penny")).toBeVisible();
  expect(calls.scans.at(-1)).toMatchObject({ mode: "find", name: "Worth a Penny" });
  await expect(page.getByText("6 COMPETITORS · 2 PLATFORMS · FIRST PULL IS NEXT")).toBeVisible();

  // The look-alike note: soft, never blocking.
  await rivals.getByRole("button", { name: "add" }).click();
  await page.getByRole("textbox", { name: "Instagram" }).last().fill("@zzfitness99");
  await expect(
    page.getByText("This doesn’t look like Giften Market’s account. Save anyway?"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create client" })).toBeEnabled();
});
