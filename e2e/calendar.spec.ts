import { expect, test, type Page, type Route } from "@playwright/test";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk } from "./helpers";
import { NOW } from "./overview-fixtures";
import { readFileSync } from "node:fs";

const us2026: unknown = JSON.parse(
  readFileSync(
    new URL("../supabase/functions/holidays/fixtures/us-2026.json", import.meta.url),
    "utf8",
  ),
);

/*
 * Slice 9 Calendar (08 / 09 / M07 / M08). An in-memory `calendar_cards` table answers GET / POST /
 * PATCH / DELETE; `holiday_cache` serves the real Nager.Date 2026 response for 2026 and is empty for
 * 2027, so the `holidays` function stub is exercised too. Nothing reaches Supabase.
 */
test.use({ timezoneId: "UTC" });

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

type Row = Record<string, unknown> & { id: string; date: string; title: string };
const card = (id: string, date: string, title: string, extra: Partial<Row> = {}): Row => ({
  id,
  date,
  title,
  platform: "instagram",
  format: "reel",
  hook: null,
  caption: null,
  visual_idea: null,
  status: "idea",
  origin: "manual",
  idea_id: null,
  updated_at: "2026-11-10T09:00:00Z",
  creator: { full_name: "Fatima Noor" },
  ...extra,
});
// Figma 08 (December 2026)
const SEED: Row[] = [
  card("k1", "2026-12-02", "Giving Tuesday: how OBU gives back", { status: "approved" }),
  card("k2", "2026-12-04", "Holiday eating, no guilt", {
    platform: "tiktok",
    format: "video",
    status: "drafting",
    hook: "“You don’t have to skip the party to stay on track.”",
    caption:
      "Three small things our clinicians suggest for holiday dinners: eat before you go, start with protein, and skip the guilt. One meal doesn’t undo your progress.",
    visual_idea: "Talking head, clinician in kitchen, 3 quick text cards. 25–35 s.",
    updated_at: "2026-11-17T10:00:00Z", // 2 h before NOW
  }),
  card("k3", "2026-12-09", "5 swaps for holiday parties", { format: "carousel" }),
  card("k4", "2026-12-11", "Doctor Q&A: travel and meds", {
    platform: "tiktok",
    format: "video",
    status: "approved",
  }),
  card("k5", "2026-12-15", "Patient story: first 90 days", { status: "approved" }),
  card("k6", "2026-12-17", "Myth vs fact", {
    platform: "tiktok",
    format: "video",
    status: "drafting",
    origin: "ai",
    idea_id: "idea-ai", // planned from Blip's idea → "Inspired by"
  }),
  card("k7", "2026-12-23", "Your holiday check-in", { format: "carousel" }),
  card("k8", "2026-12-29", "Realistic goals for 2027", {
    platform: "tiktok",
    format: "video",
    origin: "ai",
  }),
  card("k9", "2026-12-30", "Resolution season starts", { status: "drafting", origin: "ai" }),
];

// 08 idea panel (Figma): three ideas to plan; Blip's is already planned (k6), so it isn't listed.
const ideaRow = (id: string, extra: Record<string, unknown>) => ({
  id,
  kind: "note",
  note: null,
  image_path: null,
  image_width: null,
  image_height: null,
  link_url: null,
  source_snapshot: null,
  platform: "instagram",
  format: null,
  tags: [],
  planned_card_id: null,
  created_at: "2026-11-15T10:00:00Z",
  created_by: "u-fatima",
  creator: { full_name: "Fatima Noor" },
  planned: null,
  ...extra,
});
const IDEAS = [
  ideaRow("idea-hers", {
    kind: "post",
    note: "OBU version of “3 things nobody tells you” for the first month on a plan",
    format: "reel",
    source_snapshot: {
      brand: "Hers",
      date: "2026-11-12T15:00:00Z",
      caption: "3 things",
      likes: 18400,
    },
  }),
  ideaRow("idea-bts", { note: "Behind the scenes with an OBU clinician" }),
  ideaRow("idea-dry", { note: "“Dry January” check-in carousel", platform: null }),
  ideaRow("idea-ai", {
    kind: "ai",
    note: "Myth vs fact mini-series: 3 TikToks in January",
    platform: "tiktok",
    created_by: null,
    creator: null,
    planned_card_id: "k6",
    planned: { id: "k6", date: "2026-12-17" },
  }),
];

type Calls = { method: string; body: unknown; id?: string }[];

async function setup(page: Page) {
  const rows: Row[] = SEED.map((r) => ({ ...r }));
  const calls: Calls = [];
  const holidayFnYears: number[] = [];
  await page.clock.setFixedTime(NOW); // 17 Nov 2026
  await stubSupabase(page);
  await signInAs(page);

  await page.route("**/rest/v1/calendar_cards**", async (r: Route) => {
    const req = r.request();
    const url = new URL(req.url());
    const id = url.searchParams.get("id")?.replace("eq.", "");
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const method = req.method();
    if (method === "GET") {
      if (id) return r.fulfill(json(rows.find((x) => x.id === id) ?? null));
      return r.fulfill(json([...rows].sort((a, b) => a.date.localeCompare(b.date))));
    }
    const body = method === "DELETE" ? null : req.postDataJSON();
    calls.push({ method, body, id });
    if (method === "POST") {
      const row = {
        ...card(`new-${rows.length}`, "", ""),
        ...(Array.isArray(body) ? body[0] : body),
      };
      rows.push(row);
      return r.fulfill(json(single ? row : [row], 201));
    }
    if (method === "PATCH") {
      const row = rows.find((x) => x.id === id)!;
      Object.assign(row, body);
      return single ? r.fulfill(json(row)) : r.fulfill({ status: 204 });
    }
    if (method === "DELETE") {
      rows.splice(
        rows.findIndex((x) => x.id === id),
        1,
      );
      return r.fulfill({ status: 204 });
    }
    return r.fallback();
  });

  await page.route("**/rest/v1/holiday_cache**", (r) => {
    const year = new URL(r.request().url()).searchParams.get("year");
    const single = (r.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const row = { data: us2026, fetched_at: "2026-11-01T00:00:00Z" };
    if (year === "eq.2026") return r.fulfill(json(single ? row : [row]));
    return single
      ? r.fulfill(json({ code: "PGRST116", message: "no rows" }, 406))
      : r.fulfill(json([]));
  });
  await page.route("**/functions/v1/holidays**", (r) => {
    const { year } = r.request().postDataJSON() as { year: number };
    holidayFnYears.push(year);
    return r.fulfill(
      json({
        year,
        data: [{ date: `${year}-01-01`, name: "New Year's Day", global: true }],
        fetchedAt: NOW.toISOString(),
        stale: false,
      }),
    );
  });
  // Ideas (panel + "Inspired by"), and the two functions that link them to cards.
  const ideas = IDEAS.map((i) => ({ ...i }));
  await page.route("**/rest/v1/ideas**", (r: Route) => {
    const id = new URL(r.request().url()).searchParams.get("id")?.replace("eq.", "");
    const single = (r.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    if (id) {
      const found = ideas.filter((i) => i.id === id); // maybeSingle() asks for a list
      return r.fulfill(json(single ? (found[0] ?? null) : found));
    }
    return r.fulfill(json(ideas));
  });
  await page.route("**/rest/v1/rpc/plan_idea", (r: Route) => {
    const body = r.request().postDataJSON() as Record<string, string>;
    calls.push({ method: "RPC plan_idea", body });
    const row = card("card-new", body.p_date, body.p_title, {
      platform: body.p_platform,
      format: body.p_format,
      origin: "idea",
      idea_id: body.p_idea_id,
    });
    rows.push(row);
    const idea = ideas.find((i) => i.id === body.p_idea_id)!;
    Object.assign(idea, { planned_card_id: row.id, planned: { id: row.id, date: row.date } });
    return r.fulfill(json(row));
  });
  await page.route("**/rest/v1/rpc/card_to_idea", (r: Route) => {
    const body = r.request().postDataJSON() as { p_card_id: string };
    calls.push({ method: "RPC card_to_idea", body });
    rows.splice(
      rows.findIndex((x) => x.id === body.p_card_id),
      1,
    );
    return r.fulfill(json("idea-from-card"));
  });

  return { rows, calls, holidayFnYears };
}

async function open(page: Page, path = "/calendar?date=2026-12-24") {
  await page.goto(path);
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768;

test("calendar — December like Figma 08 / M07", async ({ page }, info) => {
  const { holidayFnYears } = await setup(page);
  await open(page);
  if (isDesktop(page)) {
    await expect(page.getByRole("heading", { name: "December 2026" })).toBeVisible();
    await expect(page.getByText("Holiday eating, no guilt")).toBeVisible();
    // the grid spills into January 2027 → its holidays come through the function (cache miss)
    await expect.poll(() => holidayFnYears).toEqual([2027]);
  } else {
    await expect(page.getByText("Week of 21 Dec")).toBeVisible();
    await expect(page.getByText("Resolution season · until 15 Jan")).toBeVisible();
    await expect(page.getByText("Christmas Eve")).toBeVisible();
    await tapTargetsOk(page);
  }
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`calendar-${info.project.name}.png`, { fullPage: true });
});

test("calendar — event toggles hide bars and are remembered", async ({ page }) => {
  await setup(page);
  await open(page);
  const xmas = page.getByText("Christmas Day", { exact: true });
  await expect(xmas.first()).toBeVisible();
  await page.getByRole("checkbox", { name: "Holidays" }).click();
  await expect(page.getByRole("checkbox", { name: "Holidays" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(xmas).toHaveCount(0);
  // Marketing (Christmas Eve) still shows
  await expect(page.getByText("Christmas Eve").first()).toBeVisible();
  await page.reload();
  await page.locator("h1").first().waitFor();
  await expect(page.getByRole("checkbox", { name: "Holidays" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(page.getByText("Christmas Day", { exact: true })).toHaveCount(0);
});

test("calendar — 09 card detail", async ({ page }, info) => {
  await setup(page);
  await open(page, "/calendar?date=2026-12-24&card=k2");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue(
    "Holiday eating, no guilt",
  );
  await expect(dialog.getByRole("radio", { name: "Drafting" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300); // drawer slide-in
  if (!isDesktop(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`card-detail-${info.project.name}.png`);
});

test("calendar — edit status and save", async ({ page }) => {
  const { calls } = await setup(page);
  await open(page, "/calendar?date=2026-12-24&card=k2");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Approved" }).click();
  await dialog.getByRole("button", { name: "Format: Video" }).click();
  await dialog.getByRole("option", { name: "Carousel" }).click();
  await expect(dialog.getByRole("button", { name: "Format: Carousel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls.at(-1)).toMatchObject({
    method: "PATCH",
    id: "k2",
    body: { status: "approved", format: "carousel", title: "Holiday eating, no guilt" },
  });
});

test("calendar — new post needs a title, then saves", async ({ page }) => {
  test.skip(!isDesktop(page), "hover add is a tablet/desktop pattern; mobile uses the + button");
  const { calls } = await setup(page);
  await open(page);
  await page.getByRole("group", { name: "Thursday 10 December" }).hover();
  await page.getByRole("button", { name: "Add post on Thursday 10 December" }).click();
  const dialog = page.getByRole("dialog", { name: "New post" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Thu 10 Dec")).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Add a title.")).toBeVisible();
  expect(calls).toHaveLength(0);
  await dialog.getByRole("textbox", { name: "Title" }).fill("Gift guide for healthy habits");
  await dialog.getByRole("button", { name: "Platform: not set" }).click();
  await dialog.getByRole("option", { name: "Instagram" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Gift guide for healthy habits")).toBeVisible();
  expect(calls[0]).toMatchObject({
    method: "POST",
    body: {
      date: "2026-12-10",
      title: "Gift guide for healthy habits",
      origin: "manual",
      status: "idea",
    },
  });
});

test("calendar — mobile new post uses the selected day", async ({ page }) => {
  test.skip(isDesktop(page), "phones only");
  await setup(page);
  await open(page);
  await page.getByRole("button", { name: /Saturday 26 December/ }).click();
  await page.getByRole("button", { name: "New post on 26 Dec" }).click();
  await expect(
    page.getByRole("dialog", { name: "New post" }).getByText("Sat 26 Dec"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calendar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("calendar — delete asks first", async ({ page }) => {
  const { calls } = await setup(page);
  await open(page, "/calendar?date=2026-12-24&card=k3");
  await page.getByRole("button", { name: /^Delete/ }).click();
  const confirm = page.getByRole("dialog", { name: "Delete “5 swaps for holiday parties”?" });
  await expect(confirm).toBeVisible();
  // Esc closes only the confirm; the card stays open behind it.
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(page).toHaveURL(/card=k3/);
  await page.getByRole("button", { name: /^Delete/ }).click();
  await confirm.getByRole("button", { name: "Delete card" }).click();
  await expect(page.getByText("Deleted “5 swaps for holiday parties”")).toBeVisible();
  await page.waitForTimeout(800); // the list refreshes: still this toast, no "missing card" one
  await expect(page.getByText("Deleted “5 swaps for holiday parties”")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "DELETE", id: "k3" });
});

test("calendar — drag a card to another day", async ({ page }) => {
  test.skip(!isDesktop(page), "drag and drop is on the month grid (tablet and desktop)");
  const { calls } = await setup(page);
  await open(page);
  const tile = page.getByRole("button", { name: /Doctor Q&A: travel and meds/ });
  const target = page.getByRole("group", { name: "Monday 14 December" });
  const from = (await tile.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 30, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(target.getByText("Doctor Q&A: travel and meds")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "PATCH", id: "k4", body: { date: "2026-12-14" } });
  await expect(page.getByRole("dialog")).toHaveCount(0); // a drag doesn't open the card
});

test("calendar — mobile swipes to the next week", async ({ page }) => {
  test.skip(isDesktop(page), "phones only");
  await setup(page);
  await open(page);
  await page.getByRole("button", { name: "Next week" }).focus(); // screen-reader twin of the swipe
  await page.keyboard.press("Enter");
  await expect(page.getByText("Week of 28 Dec")).toBeVisible();
  await expect(page.getByText("Realistic goals for 2027")).toBeVisible();
});

test("calendar — month arrows stay put and Today jumps back", async ({ page }) => {
  test.skip(!isDesktop(page), "month arrows are on tablet and desktop; phones swipe weeks");
  await setup(page);
  await open(page, "/calendar"); // today = 17 Nov 2026
  const today = page.getByRole("button", { name: "Today" });
  await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
  await expect(today).toBeDisabled();

  const next = page.getByRole("button", { name: /^Next month/ });
  const before = await next.boundingBox();
  await next.click(); // December 2026 → wider title than "May 2027"
  await expect(page.getByRole("heading", { name: "December 2026" })).toBeVisible();
  expect(await next.boundingBox()).toEqual(before);
  for (let i = 0; i < 5; i++) await next.click();
  await expect(page.getByRole("heading", { name: "May 2027" })).toBeVisible();
  expect(await next.boundingBox()).toEqual(before);

  await expect(today).toBeEnabled();
  await today.click();
  await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
  await expect(today).toBeDisabled();
});

test("calendar — 09 header: who/when, status pills by keyboard, chip menu", async ({ page }) => {
  await setup(page);
  await open(page, "/calendar?date=2026-12-24&card=k2");
  const dialog = page.getByRole("dialog");
  // who / when (today = 17 Nov in the test clock)
  await expect(dialog.getByText("Fatima Noor · edited 2 h ago", { exact: true })).toBeVisible();
  // The date's relation sits next to the date chip.
  await expect(dialog.getByText("in 17 days", { exact: true })).toBeVisible();
  await expect(dialog.getByText("This date is in the past")).toHaveCount(0);

  // header tinted by platform: TikTok → #E9F8FE
  const header = dialog.locator("div.rounded-panel");
  await expect(header).toHaveCSS("background-color", "rgb(233, 248, 254)");

  // status: a radio group, only the current pill is tabbable, arrows move and set
  const group = dialog.getByRole("radiogroup", { name: "Status" });
  await expect(group.getByRole("radio", { name: "Drafting" })).toHaveAttribute("tabindex", "0");
  await expect(group.getByRole("radio", { name: "Idea" })).toHaveAttribute("tabindex", "-1");
  await group.getByRole("radio", { name: "Drafting" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "Approved" })).toBeFocused();
  await expect(group.getByRole("radio", { name: "Approved" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("End");
  await expect(group.getByRole("radio", { name: "Posted" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("ArrowRight"); // wraps
  await expect(group.getByRole("radio", { name: "Idea" })).toHaveAttribute("aria-checked", "true");

  // platform chip by keyboard: ↓ opens, ↑ moves, Enter picks; the tint follows
  const platform = dialog.getByRole("button", { name: "Platform: TikTok" });
  await platform.focus();
  await page.keyboard.press("ArrowDown");
  const menu = dialog.getByRole("listbox", { name: "Platform" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Platform: Instagram" })).toBeVisible();
  await expect(header).toHaveCSS("background-color", "rgb(254, 234, 240)");
  // Video isn't an Instagram format → Format is empty again, and its menu opens by itself
  // (the next step), with focus in it.
  const format = dialog.getByRole("button", { name: "Format: not set" });
  await expect(format).toBeVisible();
  await expect(format).toHaveText("Format");
  const formats = dialog.getByRole("listbox", { name: "Format" });
  await expect(formats).toBeFocused();
  // Empty chip: dashed ink border, so it reads as clickable (ANNOTATIONS › Select chip — states).
  await page.keyboard.press("Escape");
  await expect(format.locator("span").first()).toHaveCSS("border-top-style", "dashed");
  await expect(format.locator("span").first()).toHaveCSS("border-top-color", "rgb(11, 11, 12)");

  // Esc closes only the menu, not the drawer
  await format.click();
  await expect(dialog.getByRole("listbox", { name: "Format" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("listbox", { name: "Format" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("calendar — new post: empty chips look clickable, platform leads to format", async ({
  page,
}, info) => {
  await setup(page);
  await open(page, "/calendar?date=2026-12-24&new=2026-12-24");
  const dialog = page.getByRole("dialog");
  const platform = dialog.getByRole("button", { name: "Platform: not set" });
  await expect(platform).toHaveText("Platform");
  const chip = platform.locator("span").first();
  await expect(chip).toHaveCSS("border-top-style", "dashed");
  await expect(chip).toHaveCSS("border-top-color", "rgb(11, 11, 12)"); // ink
  await expect(chip).toHaveCSS("color", "rgb(11, 11, 12)");

  // Format waits for a platform: grey, and it says why.
  const format = dialog.getByRole("button", { name: "Format: not set" });
  await expect(format).toHaveAttribute("aria-disabled", "true");
  await format.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Choose a platform first");
  await dialog.getByRole("textbox", { name: "Title" }).focus(); // tooltip away for the shot
  await page.waitForTimeout(300); // drawer slide-in
  await expect(page).toHaveScreenshot(`chips-empty-${info.project.name}.png`);

  await expect(dialog.getByText("New card · Fatima Noor", { exact: true })).toBeVisible();
  // From 768 px platform, format and date stay on one line (the relation may go below).
  if (isDesktop(page)) {
    const tops = await dialog
      .locator(
        'button[aria-label^="Platform"], button[aria-label^="Format"], input[aria-label="Date"]',
      )
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  }

  // Pick a platform → the format menu opens by itself.
  await platform.click();
  await dialog.getByRole("option", { name: "Instagram" }).click();
  const formats = dialog.getByRole("listbox", { name: "Format" });
  await expect(formats).toBeVisible();
  await expect(formats).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("button", { name: "Format: Reel" })).toBeVisible();
});

test("calendar — longest chips still fit on one line in the drawer", async ({ page }) => {
  test.skip(!isDesktop(page), "the drawer is tablet/desktop; phones may wrap");
  await setup(page);
  await open(page, "/calendar?date=2026-12-24&card=k3"); // Instagram · Carousel
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Format: Carousel" })).toBeVisible();
  const tops = await dialog
    .locator(
      'button[aria-label^="Platform"], button[aria-label^="Format"], input[aria-label="Date"]',
    )
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  // Nothing sticks out of the tinted panel.
  const panel = (await dialog.locator("div.rounded-panel").boundingBox())!;
  const relation = (await dialog.getByText(/^in \d+ days$/).boundingBox())!;
  expect(relation.x + relation.width).toBeLessThanOrEqual(panel.x + panel.width);
});

test("calendar — a past date gets an amber note unless posted", async ({ page }) => {
  await setup(page);
  await open(page, "/calendar?date=2026-12-24&card=k2");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Date").fill("2026-11-10"); // before 17 Nov (test clock)
  await expect(dialog.getByText("7 days ago", { exact: true })).toBeVisible();
  await expect(dialog.getByText("This date is in the past")).toBeVisible();
  await dialog.getByRole("radio", { name: "Posted" }).click();
  await expect(dialog.getByText("This date is in the past")).toHaveCount(0);
  // Not blocking: Save still works.
  await expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled();
});

test("calendar — chip menu, open", async ({ page }, info) => {
  await setup(page);
  await open(page, "/calendar?date=2026-12-24&card=k2");
  await page.getByRole("dialog").getByRole("button", { name: "Platform: TikTok" }).click();
  await expect(page.getByRole("listbox", { name: "Platform" })).toBeVisible();
  await page.waitForTimeout(300); // drawer slide-in
  await expect(page).toHaveScreenshot(`chip-menu-${info.project.name}.png`);
});

// ───────────────────────────── 10d: calendar ↔ ideas

test("calendar — idea panel lists ideas not planned yet (08)", async ({ page }) => {
  test.skip(!isDesktop(page), "the panel is tablet/desktop; phones use the Ideas tab");
  await setup(page);
  await open(page);
  const panel = page.getByRole("complementary", { name: "Idea board" });
  await expect(panel.getByText("FROM Hers · 12 NOV", { exact: false })).toBeVisible();
  await expect(panel.getByText("Behind the scenes with an OBU clinician")).toBeVisible();
  await expect(panel.getByText("“Dry January” check-in carousel")).toBeVisible();
  await expect(panel.getByText("Myth vs fact mini-series")).toHaveCount(0); // already planned
  await expect(panel.getByRole("link", { name: "Add idea" })).toHaveAttribute("href", "/ideas");
});

test("calendar — drag an idea onto a day plans it", async ({ page }) => {
  test.skip(!isDesktop(page), "drag and drop is on the month grid (tablet and desktop)");
  const { calls } = await setup(page);
  await open(page);
  const idea = page.getByRole("button", { name: /^Behind the scenes with an OBU clinician/ });
  const target = page.getByRole("group", { name: "Monday 14 December" });
  await idea.scrollIntoViewIfNeeded();
  const from = (await idea.boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  await target.scrollIntoViewIfNeeded();
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + 40, from.y + 30, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText("Planned for Mon 14 Dec")).toBeVisible();
  expect(calls.find((c) => c.method === "RPC plan_idea")?.body).toEqual({
    p_idea_id: "idea-bts",
    p_date: "2026-12-14",
    p_platform: "instagram",
    p_format: null,
    p_title: "Behind the scenes with an OBU clinician",
  });
  // The idea leaves the panel; the card is on the day.
  await expect(
    page.getByRole("button", { name: /^Behind the scenes with an OBU clinician/ }),
  ).toHaveCount(0);
  await expect(target.getByText("Behind the scenes with an OBU clinician")).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/card=card-new/);
});

test("calendar — clicking an idea in the panel opens it on the board with Plan it", async ({
  page,
}) => {
  test.skip(!isDesktop(page), "the panel is tablet/desktop");
  await setup(page);
  await open(page);
  await page.getByRole("button", { name: /^“Dry January” check-in carousel/ }).click();
  await expect(page).toHaveURL(/\/ideas\?idea=idea-dry&plan=1$/);
});

test("calendar — Move to idea board (card_to_idea)", async ({ page }) => {
  test.skip(!isDesktop(page), "the button is in the drawer from 768 px (M08 has Delete + Save)");
  const { calls } = await setup(page);
  await open(page, "/calendar?date=2026-12-24&card=k3");
  await page.getByRole("button", { name: "Move to idea board" }).click();
  const confirm = page.getByRole("dialog", { name: "Move it to the idea board?" });
  await expect(confirm.getByText(/becomes a note on the idea board/)).toBeVisible();
  await confirm.getByRole("button", { name: "Move to idea board" }).click();
  await expect(page.getByText("Moved to the idea board")).toBeVisible();
  // Still the same toast a moment later (not replaced by "isn't on the calendar any more").
  await page.waitForTimeout(800);
  await expect(page.getByText("Moved to the idea board")).toBeVisible();
  expect(calls.find((c) => c.method === "RPC card_to_idea")?.body).toEqual({ p_card_id: "k3" });
  await expect(page.getByRole("button", { name: /5 swaps for holiday parties/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/\/ideas\?idea=idea-from-card$/);
});

test("calendar — Inspired by shows the idea a card came from (09)", async ({ page }, info) => {
  await setup(page);
  await open(page, "/calendar?date=2026-12-17&card=k6");
  const dialog = page.getByRole("dialog");
  const inspired = dialog.getByRole("link", { name: /Inspired by/ });
  await expect(inspired).toContainText("Myth vs fact mini-series: 3 TikToks in January");
  await expect(inspired).toContainText("Blip");
  // A card made from an idea: Move to idea board puts the idea back instead of making a note.
  if (isDesktop(page)) {
    await dialog.getByRole("button", { name: "Move to idea board" }).click();
    await expect(
      page
        .getByRole("dialog", { name: "Move it to the idea board?" })
        .getByText(/its idea goes back/),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot(`card-inspired-${info.project.name}.png`);
  await inspired.click();
  await expect(page).toHaveURL(/\/ideas\?idea=idea-ai$/);
});
