import { expect, test, type Page, type Route } from "@playwright/test";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk } from "./helpers";
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
  // check-handle: "noomofficial" doesn't exist (0 credits), anything else does (2 credits).
  await page.route("**/functions/v1/check-handle**", (r) => {
    const body = r.request().postDataJSON() as { platform: string; handle: string };
    checks.push(body);
    const missing = body.handle === "noomofficial";
    return r.fulfill(
      json({
        status: missing ? "not_found" : "ok",
        handle: body.handle,
        creditsUsed: missing ? 0 : 2,
        credits: { remaining: 586, plan: 1000 },
      }),
    );
  });
  return { rows, checks };
}

async function ready(page: Page, path = "/competitors") {
  await page.goto(path);
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
  await expect(add.getByRole("alert")).toHaveText("Add at least one handle (Instagram or TikTok).");
  await add.getByRole("textbox", { name: "Instagram" }).fill("@HIMS");
  await add.getByRole("textbox", { name: "TikTok" }).fill("no spaces");
  await add.getByRole("button", { name: "Save Copycat" }).click();
  await expect(add.getByText("Hims Health already uses this handle.")).toBeVisible();
  await expect(add.getByText("Use 2–24 letters, numbers, dots or underscores.")).toBeVisible();
  expect(checks).toHaveLength(0);
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

  await page.goto("/overview");
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

/** Names of the CSS animations running on the open <dialog> and its backdrop. */
const dialogAnimations = (page: Page) =>
  page.evaluate(() =>
    (document.querySelector("dialog[open]")?.getAnimations({ subtree: true }) ?? [])
      .filter((a) => a instanceof CSSAnimation)
      .map((a) => (a as CSSAnimation).animationName)
      // The modal's own motion; Blip inside it (Slice 13) animates too but isn't what's checked here.
      .filter((n) => n.startsWith("modal-"))
      .sort(),
  );

test("motion: drawer slides in / out, sheets slide up, backdrop fades", async ({ page }, info) => {
  await setup(page);
  await ready(page);
  await page.getByRole("button", { name: "Add competitor" }).click();
  const panel = page.getByRole("dialog", { name: "Add competitor" });
  await expect(panel).toBeVisible();
  expect(await dialogAnimations(page)).toEqual(["modal-drawer-in", "modal-fade-in"]);
  await expect(panel).toHaveAttribute("data-motion", "drawer");

  // Close: it stays in the page (sliding out) and only then goes away.
  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(panel).toHaveAttribute("data-closing", "");
  expect(await page.evaluate(() => document.querySelector("dialog[data-closing]") !== null)).toBe(
    true,
  );
  await expect(page.locator("dialog[data-motion='drawer']")).toHaveCount(0); // unmounted after exit

  // Confirm: centred; on mobile it's a bottom sheet that slides up.
  await page.getByRole("button", { name: "Remove Hims" }).filter({ visible: true }).click();
  const confirm = page.getByRole("dialog", { name: "Remove Hims?" });
  await expect(confirm.getByRole("heading", { name: "Remove Hims?" })).toHaveCSS(
    "text-align",
    "center",
  );
  if (isMobile(info.project.name)) {
    expect(await dialogAnimations(page)).toEqual(["modal-fade-in", "modal-sheet-in"]);
  }
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
});

test("motion: reduced motion fades only", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  await ready(page);
  await page.getByRole("button", { name: "Add competitor" }).click();
  await expect(page.getByRole("dialog", { name: "Add competitor" })).toBeVisible();
  expect(await dialogAnimations(page)).toEqual(["modal-fade-in", "modal-fade-in"]);
});
