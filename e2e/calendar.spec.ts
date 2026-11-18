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
  }),
  card("k7", "2026-12-23", "Your holiday check-in", { format: "carousel" }),
  card("k8", "2026-12-29", "Realistic goals for 2027", {
    platform: "tiktok",
    format: "video",
    origin: "ai",
  }),
  card("k9", "2026-12-30", "Resolution season starts", { status: "drafting", origin: "ai" }),
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
  await dialog.getByRole("combobox", { name: "Format" }).selectOption("carousel");
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
  await dialog.getByRole("combobox", { name: "Platform" }).selectOption("instagram");
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
  await confirm.getByRole("button", { name: "Delete card" }).click();
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
