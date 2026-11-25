import { expect, test, type Page, type Route } from "@playwright/test";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk, appUrl } from "./helpers";
import { BRANDS, makePosts, NOW } from "./overview-fixtures";

/*
 * Slice 8 Competitors (07 / 07b / 07c). A small in-memory `competitors` table answers GET / POST / PATCH /
 * DELETE, and check-handle is stubbed — nothing reaches Supabase or Firecrawl (0 credits).
 */
test.use({ timezoneId: "UTC" });

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const LATEST = { id: "pull-new", started_at: "2026-11-16T16:20:00Z", status: "done" };

type Row = Record<string, unknown> & { id: string; name: string };
const SEED: Row[] = BRANDS.map((b) => ({
  ...b,
  instagram_handle: b.id === "c-ro" ? "ro.co" : b.id.replace("c-", ""),
  tiktok_handle: b.id === "c-lifemd" ? null : b.id.replace("c-", ""),
  instagram_status: b.id === "c-hers" ? "unchecked" : "ok",
  tiktok_status: b.id === "c-found" ? "not_found" : b.id === "c-lifemd" ? "unchecked" : "ok",
  // Slice 15a: one brand with a LinkedIn company page; the rest have none.
  linkedin_url: b.id === "c-hims" ? "https://www.linkedin.com/company/hims-&-hers/" : null,
  linkedin_status: b.id === "c-hims" ? "ok" : "unchecked",
  // Slice 16a: WeightWatchers has a Facebook page (followers read when it was saved).
  facebook_url: b.id === "c-ww" ? "https://www.facebook.com/weightwatchers" : null,
  facebook_status: b.id === "c-ww" ? "ok" : "unchecked",
  facebook_followers: b.id === "c-ww" ? 2_901_902 : null,
  facebook_followers_at: b.id === "c-ww" ? "2026-11-10T09:00:00Z" : null,
}));

/** Returns the check-handle calls made, for "no credits spent" assertions. */
async function setup(page: Page) {
  const rows: Row[] = SEED.map((r) => ({ ...r }));
  const checks: { platform: string; handle: string }[] = [];
  await page.clock.setFixedTime(NOW);
  await stubSupabase(page);
  await signInAs(page);

  await page.route("**/rest/v1/competitors**", async (r: Route) => {
    const req = r.request();
    const url = new URL(req.url());
    const id = url.searchParams.get("id")?.replace("eq.", "");
    if (req.method() === "GET")
      return r.fulfill(json([...rows].sort((a, b) => a.name.localeCompare(b.name))));
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      const row = { id: `c-new-${rows.length}`, ...(Array.isArray(body) ? body[0] : body) } as Row;
      rows.push(row);
      const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      return r.fulfill(json(single ? { id: row.id } : [{ id: row.id }], 201));
    }
    if (req.method() === "PATCH") {
      const row = rows.find((x) => x.id === id);
      if (row) Object.assign(row, req.postDataJSON());
      return r.fulfill({ status: 204 });
    }
    if (req.method() === "DELETE") {
      rows.splice(
        rows.findIndex((x) => x.id === id),
        1,
      );
      return r.fulfill({ status: 204 });
    }
    return r.fallback();
  });
  await page.route("**/rest/v1/pulls**", (r) =>
    r.fulfill(json(r.request().url().includes("status=eq.running") ? null : [LATEST])),
  );
  const posts = makePosts(LATEST.id, new Date(LATEST.started_at));
  // Posts of a removed brand disappear (the database cascades the delete).
  await page.route("**/rest/v1/posts**", (r) =>
    r.fulfill(json(posts.filter((p) => rows.some((x) => x.id === p.competitor_id)))),
  );
  // check-handle: "noomofficial", the LinkedIn page "nosuchco" and the Facebook page "nosuchpage" don't
  // exist (0 credits); anything else does (2 credits; Facebook 5 with the page's followers).
  await page.route("**/functions/v1/check-handle**", (r) => {
    const body = r.request().postDataJSON() as { platform: string; handle: string };
    checks.push({ platform: body.platform, handle: body.handle }); // clientId (17a) is checked separately
    const missing =
      body.handle === "noomofficial" ||
      body.handle === "https://www.linkedin.com/company/nosuchco/" ||
      body.handle === "https://www.facebook.com/nosuchpage";
    const facebook = body.platform === "facebook";
    // YouTube (18): the official API — free, with the channel id and subscribers.
    if (body.platform === "youtube") {
      const gone = body.handle === "nosuchchannel";
      return r.fulfill(
        json({
          status: gone ? "not_found" : "ok",
          handle: body.handle,
          creditsUsed: 0,
          credits: null,
          followers: gone ? null : 187_000,
          channelId: gone ? null : "UC7AWNWptGGpybSgZbV34yBw",
        }),
      );
    }
    return r.fulfill(
      json({
        status: missing ? "not_found" : "ok",
        handle: body.handle,
        creditsUsed: missing ? 0 : facebook ? 5 : 2,
        credits: { remaining: 586, plan: 1000 },
        followers: !missing && facebook ? 1_234_567 : null,
      }),
    );
  });
  return { rows, checks };
}

async function ready(page: Page, path = "/competitors") {
  await page.goto(appUrl(path));
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

const isMobile = (name: string) => name === "mobile-390";

test("07 list: handles, status, posts in the latest pull", async ({ page }, info) => {
  await setup(page);
  await ready(page);
  await expect(
    page.getByText("6 brands tracked. Changes apply on the next Refresh."),
  ).toBeVisible();
  const visible = (t: string) => page.getByText(t, { exact: true }).filter({ visible: true });
  await expect(visible("TikTok not found")).toHaveCount(1); // Found
  await expect(visible("Not checked")).toHaveCount(1); // Hers (Instagram unchecked)
  await expect(visible("OK")).toHaveCount(4); // LifeMD has no TikTok: a missing handle doesn't count
  await expect(visible("@ro.co")).toBeVisible();
  await expect(visible("hims-&-hers")).toBeVisible(); // LinkedIn page, shown by its slug
  await expect(visible("weightwatchers")).toBeVisible(); // Facebook page, shown by its slug
  // Posts in the latest pull: Found has 8 in the fixture (8 − brand index 0).
  await expect(
    page.getByRole("button", { name: "Edit Found" }).filter({ visible: true }),
  ).toBeVisible();
  await noSidewaysScroll(page);
  if (isMobile(info.project.name)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot("competitors.png", { fullPage: true });
});

test("07b add: one handle found, one not found; then save without it", async ({ page }, info) => {
  const { rows, checks } = await setup(page);
  await ready(page);
  await page.getByRole("button", { name: "Add competitor" }).click();
  const panel = page.getByRole("dialog", { name: "Add competitor" });
  await expect(panel).toBeVisible();
  if (isMobile(info.project.name)) {
    // Measure once it has finished sliding in.
    await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const box = await panel.boundingBox();
    expect(box!.width).toBe(390); // full-screen page on mobile (DESIGN_SYSTEM › Drawer)
    expect(box!.height).toBe(844);
  }

  await panel.getByRole("textbox", { name: "Brand name" }).fill("Noom");
  await expect(panel.getByRole("textbox", { name: "Initials" })).toHaveValue("No");
  await expect(panel.getByText("No handle to check · no credits")).toBeVisible();
  await panel.getByRole("textbox", { name: "Instagram" }).fill("@noom");
  await panel.getByRole("textbox", { name: "TikTok" }).fill("https://www.tiktok.com/@noomofficial");
  await expect(panel.getByText("Checking costs 2 credits per handle · up to 4 now")).toBeVisible();
  await panel.getByRole("button", { name: "Save Noom" }).click();

  // After a partial save the panel is editing the new row ("Edit Noom").
  const edit = page.getByRole("dialog", { name: "Edit Noom" });
  await expect(edit.getByText("Found · public account")).toBeVisible();
  await expect(edit.getByText("Not found. Check the spelling or leave it empty.")).toBeVisible();
  await expect(edit.getByRole("textbox", { name: "TikTok" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(edit.getByRole("alert")).toHaveText("Saved Noom without the TikTok handle.");
  expect(checks).toEqual([
    { platform: "instagram", handle: "noom" },
    { platform: "tiktok", handle: "noomofficial" },
  ]);
  expect(rows.find((r) => r.name === "Noom")).toMatchObject({
    initials: "No",
    instagram_handle: "noom",
    instagram_status: "ok",
    tiktok_handle: null,
  });
  await noSidewaysScroll(page);
  if (isMobile(info.project.name)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot("competitor-panel-checked.png");

  // A missing TikTok is allowed: clear it and save — nothing left to check, no credits.
  await edit.getByRole("textbox", { name: "TikTok" }).fill("");
  await expect(edit.getByText("No handle to check · no credits")).toBeVisible();
  await edit.getByRole("button", { name: "Save Noom" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByRole("status").getByText("Saved Noom")).toBeVisible();
  expect(checks).toHaveLength(2);
  await expect(
    page.getByText("7 brands tracked. Changes apply on the next Refresh."),
  ).toBeVisible();
});

test("07b edit: name only costs nothing; free validation", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  const { rows, checks } = await setup(page);
  await ready(page);

  await page.getByRole("button", { name: "Edit Hims" }).filter({ visible: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit Hims" });
  await expect(panel.getByRole("textbox", { name: "Instagram" })).toHaveValue("@hims");
  await panel.getByRole("textbox", { name: "Brand name" }).fill("Hims Health");
  await expect(panel.getByRole("textbox", { name: "Initials" })).toHaveValue("Hi"); // saved initials kept
  await panel.getByRole("button", { name: "Save Hims Health" }).click();
  await expect(panel).toBeHidden();
  expect(checks).toHaveLength(0);
  expect(rows.find((r) => r.id === "c-hims")).toMatchObject({
    name: "Hims Health",
    instagram_handle: "hims",
    instagram_status: "ok",
  });

  // Free checks before any credits: no handle, a duplicate, a malformed handle.
  await page.getByRole("button", { name: "Add competitor" }).click();
  const add = page.getByRole("dialog", { name: "Add competitor" });
  await add.getByRole("textbox", { name: "Brand name" }).fill("Copycat");
  await add.getByRole("button", { name: "Save Copycat" }).click();
  await expect(add.getByRole("alert")).toHaveText("Add at least one handle or page.");
  await add.getByRole("textbox", { name: "Instagram" }).fill("@HIMS");
  await add.getByRole("textbox", { name: "TikTok" }).fill("no spaces");
  await add.getByRole("button", { name: "Save Copycat" }).click();
  await expect(add.getByText("Hims Health already uses this handle.")).toBeVisible();
  await expect(add.getByText("Use 2–24 letters, numbers, dots or underscores.")).toBeVisible();
  expect(checks).toHaveLength(0);
});

test("07b LinkedIn: company page checked on save, free validation first", async ({
  page,
}, info) => {
  const { rows, checks } = await setup(page);
  await ready(page);
  await page.getByRole("button", { name: "Add competitor" }).click();
  const panel = page.getByRole("dialog", { name: "Add competitor" });
  await panel.getByRole("textbox", { name: "Brand name" }).fill("Noom");
  const linkedin = panel.getByRole("textbox", { name: "LinkedIn" });
  await expect(linkedin).toHaveAttribute("placeholder", "Company page link (optional)");

  // A personal profile or another page's link is refused for free.
  await linkedin.fill("https://www.linkedin.com/in/someone/");
  await panel.getByRole("button", { name: "Save Noom" }).click();
  await expect(panel.getByText("Use a company page link (linkedin.com/company/…).")).toBeVisible();
  // The same page as another brand: refused for free too.
  await linkedin.fill("linkedin.com/company/Hims-%26-Hers");
  await panel.getByRole("button", { name: "Save Noom" }).click();
  await expect(panel.getByText("Hims already uses this page.")).toBeVisible();
  expect(checks).toHaveLength(0);

  // A page that doesn't exist: checked (0 credits), not saved, nothing created.
  await linkedin.fill("https://www.linkedin.com/company/nosuchco/posts/");
  await panel.getByRole("button", { name: "Save Noom" }).click();
  await expect(panel.getByText("Not found. Check the spelling or leave it empty.")).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveText(
    "Nothing saved yet: fix the handle or try another.",
  );
  if (isMobile(info.project.name)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot("competitor-panel-linkedin.png");

  // A real page, given as a link: stored as the canonical URL.
  await linkedin.fill("https://www.linkedin.com/company/noom/about/");
  await panel.getByRole("button", { name: "Save Noom" }).click();
  await expect(page.getByRole("status").getByText("Added Noom")).toBeVisible();
  expect(checks).toEqual([
    { platform: "linkedin", handle: "https://www.linkedin.com/company/nosuchco/" },
    { platform: "linkedin", handle: "https://www.linkedin.com/company/noom/" },
  ]);
  expect(rows.find((r) => r.name === "Noom")).toMatchObject({
    instagram_handle: null,
    tiktok_handle: null,
    linkedin_url: "https://www.linkedin.com/company/noom/",
    linkedin_status: "ok",
  });
  await noSidewaysScroll(page);
});

test("07c remove: confirm, then gone from the dashboards", async ({ page }, info) => {
  const { rows } = await setup(page);
  await ready(page);
  await page.getByRole("button", { name: "Remove Found" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "Remove Found?" });
  await expect(dialog).toContainText(
    "Found’s saved posts will disappear from the dashboards and won’t be pulled again. Ideas saved from its posts stay on the idea board.",
  );
  if (isMobile(info.project.name)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot("competitor-remove.png");

  await dialog.getByRole("button", { name: "Remove Found" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").getByText("Removed Found")).toBeVisible();
  expect(rows.some((r) => r.id === "c-found")).toBe(false);
  await expect(
    page.getByText("5 brands tracked. Changes apply on the next Refresh."),
  ).toBeVisible();

  await page.goto(appUrl("/overview"));
  await page.locator("h1").first().waitFor();
  await expect(
    page.getByRole("group", { name: "Brands" }).getByRole("button", { name: "Hims", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Brands" }).getByRole("button", { name: "Found" }),
  ).toHaveCount(0);
});

test("Fix handle link opens the panel pre-filled", async ({ page }) => {
  await setup(page);
  await ready(page, "/competitors?edit=c-found&focus=tiktok");
  const panel = page.getByRole("dialog", { name: "Edit Found" });
  await expect(panel).toBeVisible();
  const tiktok = panel.getByRole("textbox", { name: "TikTok" });
  await expect(tiktok).toHaveValue("@found");
  await expect(tiktok).toBeFocused();
  await expect(panel.getByText("Not found in the last pull. Check the spelling.")).toBeVisible();
  await expect(page).toHaveScreenshot("competitor-fix-handle.png");
  // Esc closes and clears the URL.
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/competitors$/);
});

test("Fix page link opens the panel on the LinkedIn field", async ({ page }) => {
  const { rows } = await setup(page);
  const hims = rows.find((r) => r.id === "c-hims")!;
  hims.linkedin_status = "not_found";
  await ready(page, "/competitors?edit=c-hims&focus=linkedin");
  const panel = page.getByRole("dialog", { name: "Edit Hims" });
  const linkedin = panel.getByRole("textbox", { name: "LinkedIn" });
  await expect(linkedin).toHaveValue("linkedin.com/company/hims-&-hers");
  await expect(linkedin).toBeFocused();
  await expect(panel.getByText("Not found in the last pull. Check the spelling.")).toBeVisible();
});

test("07b Facebook: page checked on save (up to 5 credits), followers saved with the date", async ({
  page,
}, info) => {
  const { rows, checks } = await setup(page);
  await ready(page);
  await page.getByRole("button", { name: "Add competitor" }).click();
  const panel = page.getByRole("dialog", { name: "Add competitor" });
  await panel.getByRole("textbox", { name: "Brand name" }).fill("Noom");
  const facebook = panel.getByRole("textbox", { name: "Facebook" });
  await expect(facebook).toHaveAttribute("placeholder", "Page link (optional)");

  // A group link is refused for free; so is another brand's page.
  await facebook.fill("https://www.facebook.com/groups/noomcoaching");
  await panel.getByRole("button", { name: "Save Noom" }).click();
  await expect(panel.getByText("Use a Facebook page link (facebook.com/…).")).toBeVisible();
  await facebook.fill("m.facebook.com/WeightWatchers/posts");
  await panel.getByRole("button", { name: "Save Noom" }).click();
  await expect(panel.getByText("WeightWatchers already uses this page.")).toBeVisible();
  expect(checks).toHaveLength(0);

  // The cost line warns before anything is spent.
  await facebook.fill("facebook.com/nosuchpage");
  await expect(panel.getByText("Checking costs up to 5 credits")).toBeVisible();
  await panel.getByRole("button", { name: "Save Noom" }).click();
  await expect(panel.getByText("Not found. Check the spelling or leave it empty.")).toBeVisible();

  // A real page: found with its followers, stored as the canonical URL with today's date.
  await facebook.fill("https://www.facebook.com/noom/");
  await panel.getByRole("button", { name: "Save Noom" }).click();
  await expect(page.getByRole("status").getByText("Added Noom")).toBeVisible();
  expect(checks).toEqual([
    { platform: "facebook", handle: "https://www.facebook.com/nosuchpage" },
    { platform: "facebook", handle: "https://www.facebook.com/noom" },
  ]);
  expect(rows.find((r) => r.name === "Noom")).toMatchObject({
    facebook_url: "https://www.facebook.com/noom",
    facebook_status: "ok",
    facebook_followers: 1_234_567,
    facebook_followers_at: NOW.toISOString(),
  });

  // Reopening shows the followers "as of" the check; an unchanged page is never checked again.
  await page.getByRole("button", { name: "Edit Noom" }).filter({ visible: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Noom" });
  await expect(edit.getByRole("textbox", { name: "Facebook" })).toHaveValue("facebook.com/noom");
  await expect(edit.getByText("Found · public page · 1.2M followers as of 17 Nov")).toBeVisible();
  await expect(edit.getByText("No handle to check · no credits")).toBeVisible();
  if (isMobile(info.project.name)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot("competitor-panel-facebook.png");
});

test("07b YouTube (Slice 18): @handle or channel link, checked free, subscribers saved", async ({
  page,
}, info) => {
  const { rows, checks } = await setup(page);
  await ready(page);
  // Desktop table (tablet and phone show cards with every platform).
  if (info.project.name === "desktop-1440")
    await expect(page.getByRole("columnheader", { name: "YouTube" })).toBeVisible();
  await page.getByRole("button", { name: "Add competitor" }).click();
  const panel = page.getByRole("dialog", { name: "Add competitor" });
  await panel.getByRole("textbox", { name: "Brand name" }).fill("Noom");
  const youtube = panel.getByRole("textbox", { name: "YouTube" });
  await expect(youtube).toHaveAttribute("placeholder", "@handle or channel link (optional)");

  // A video link is refused for free.
  await youtube.fill("https://www.youtube.com/watch?v=Hm3jtqHt8tM");
  await panel.getByRole("button", { name: "Save Noom" }).click();
  await expect(
    panel.getByText("Use the channel’s @handle (youtube.com/@…) or a youtube.com/channel/… link."),
  ).toBeVisible();
  expect(checks).toHaveLength(0);

  // The cost line: YouTube is free. A made-up channel → not found.
  await youtube.fill("@NoSuchChannel");
  await expect(panel.getByText("Checking YouTube is free · no credits")).toBeVisible();
  await panel.getByRole("button", { name: "Save Noom" }).click();
  await expect(panel.getByText("Not found. Check the spelling or leave it empty.")).toBeVisible();

  // A real channel link: found with its subscribers; the channel id is saved for the pulls.
  await youtube.fill("https://www.youtube.com/@NoomInc/videos");
  await panel.getByRole("button", { name: "Save Noom" }).click();
  await expect(page.getByRole("status").getByText("Added Noom")).toBeVisible();
  expect(checks).toEqual([
    { platform: "youtube", handle: "nosuchchannel" },
    { platform: "youtube", handle: "noominc" },
  ]);
  expect(rows.find((r) => r.name === "Noom")).toMatchObject({
    youtube_handle: "noominc",
    youtube_status: "ok",
    youtube_channel_id: "UC7AWNWptGGpybSgZbV34yBw",
    youtube_subscribers: 187_000,
  });

  await page.getByRole("button", { name: "Edit Noom" }).filter({ visible: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Noom" });
  await expect(edit.getByRole("textbox", { name: "YouTube" })).toHaveValue("@noominc");
  await expect(edit.getByText("Found · public channel · 187K subscribers")).toBeVisible();
  if (isMobile(info.project.name)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot("competitor-panel-youtube.png");
});

test("handle checks say which client they're for (Slice 17a usage)", async ({ page }) => {
  await setup(page);
  await ready(page);
  await page.getByRole("button", { name: "Add competitor" }).click();
  const panel = page.getByRole("dialog", { name: "Add competitor" });
  await panel.getByRole("textbox", { name: "Brand name" }).fill("Noom");
  await panel.getByRole("textbox", { name: "Instagram" }).fill("@noom");
  const req = page.waitForRequest("**/functions/v1/check-handle**");
  await panel.getByRole("button", { name: "Save Noom" }).click();
  expect((await req).postDataJSON()).toMatchObject({
    platform: "instagram",
    handle: "noom",
    clientId: "client-1",
  });
});

test("Fix page link opens the panel on the Facebook field", async ({ page }) => {
  const { rows } = await setup(page);
  const ww = rows.find((r) => r.id === "c-ww")!;
  ww.facebook_status = "not_found";
  await ready(page, "/competitors?edit=c-ww&focus=facebook");
  const panel = page.getByRole("dialog", { name: "Edit WeightWatchers" });
  const facebook = panel.getByRole("textbox", { name: "Facebook" });
  await expect(facebook).toHaveValue("facebook.com/weightwatchers");
  await expect(facebook).toBeFocused();
  await expect(panel.getByText("Not found in the last pull. Check the spelling.")).toBeVisible();
});

/**
 * Record the modal's own animations (dialog + ::backdrop) as they start, and whether a dialog was ever
 * marked data-closing. Recording beats reading live animations: under parallel load a 200 ms animation
 * can be over before the check runs. Blip (Slice 13) animates inside too; only "modal-*" counts.
 */
async function recordModalMotion(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __modalAnims: string[]; __sawClosing: boolean };
    w.__modalAnims = [];
    w.__sawClosing = false;
    document.addEventListener(
      "animationstart",
      (e) => {
        if (e.animationName.startsWith("modal-")) w.__modalAnims.push(e.animationName);
      },
      true,
    );
    new MutationObserver((records) => {
      if (records.some((r) => (r.target as Element).hasAttribute?.("data-closing")))
        w.__sawClosing = true;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-closing"] });
  });
}

/** Modal animations that started since the last call (sorted), then start a fresh list. */
const dialogAnimations = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __modalAnims: string[] };
    const names = [...w.__modalAnims].sort();
    w.__modalAnims = [];
    return names;
  });

test("motion: drawer slides in / out, sheets slide up, backdrop fades", async ({ page }, info) => {
  await recordModalMotion(page);
  await setup(page);
  await ready(page);
  await dialogAnimations(page); // start counting from here
  await page.getByRole("button", { name: "Add competitor" }).click();
  const panel = page.getByRole("dialog", { name: "Add competitor" });
  await expect(panel).toBeVisible();
  await expect.poll(() => dialogAnimations(page)).toEqual(["modal-drawer-in", "modal-fade-in"]);
  await expect(panel).toHaveAttribute("data-motion", "drawer");

  // Close: it stays in the page (sliding out, marked data-closing) and only then goes away.
  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("dialog[data-motion='drawer']")).toHaveCount(0); // unmounted after exit
  expect(
    await page.evaluate(() => (window as unknown as { __sawClosing: boolean }).__sawClosing),
  ).toBe(true);
  await dialogAnimations(page); // the exit animations aren't what's checked next

  // Confirm: centred; on mobile it's a bottom sheet that slides up.
  await page.getByRole("button", { name: "Remove Hims" }).filter({ visible: true }).click();
  const confirm = page.getByRole("dialog", { name: "Remove Hims?" });
  await expect(confirm.getByRole("heading", { name: "Remove Hims?" })).toHaveCSS(
    "text-align",
    "center",
  );
  if (isMobile(info.project.name)) {
    await expect.poll(() => dialogAnimations(page)).toEqual(["modal-fade-in", "modal-sheet-in"]);
  }
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
});

test("motion: reduced motion fades only", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordModalMotion(page);
  await setup(page);
  await ready(page);
  await dialogAnimations(page);
  await page.getByRole("button", { name: "Add competitor" }).click();
  await expect(page.getByRole("dialog", { name: "Add competitor" })).toBeVisible();
  await expect.poll(() => dialogAnimations(page)).toEqual(["modal-fade-in", "modal-fade-in"]);
});
