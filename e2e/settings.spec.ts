import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk } from "./helpers";
import { NOW } from "./overview-fixtures";

/*
 * Slice 12 Settings (13 / M12). Team (team_members / set_member_role / set_member_access), usage
 * (credits, usage_meters.groq, usage_sizes), Data (CSV exports, clear-pull) and Account, plus the
 * "Your access was removed" screen. Every call is stubbed: nothing reaches Supabase.
 */
test.use({ timezoneId: "UTC" });

const ME = "00000000-0000-4000-8000-000000000001"; // signInAs's user id
const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const us2026: unknown = JSON.parse(
  readFileSync(
    new URL("../supabase/functions/holidays/fixtures/us-2026.json", import.meta.url),
    "utf8",
  ),
);
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

type Row = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "member";
  disabled_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
};
const TEAM: Row[] = [
  {
    id: ME,
    email: "fatima.noor@breakthirty.com",
    full_name: "Fatima Noor",
    role: "admin",
    disabled_at: null,
    last_sign_in_at: "2026-11-17T09:00:00Z",
    created_at: "2026-11-01T00:00:00Z",
  },
  {
    id: "u-ryan",
    email: "ryan@breakthirty.com",
    full_name: "Ryan",
    role: "member",
    disabled_at: null,
    last_sign_in_at: "2026-11-15T09:00:00Z",
    created_at: "2026-11-02T00:00:00Z",
  },
  {
    id: "u-sherry",
    email: "sherry@breakthirty.com",
    full_name: "Sherry",
    role: "member",
    disabled_at: null,
    last_sign_in_at: "2026-11-02T09:00:00Z",
    created_at: "2026-11-02T00:00:00Z",
  },
];

async function setup(
  page: Page,
  opts: {
    role?: "admin" | "member";
    refuse?: string;
    clear?: (r: Route) => Promise<void> | void;
    noPull?: boolean;
    deleteAll?: (r: Route) => Promise<void> | void;
  } = {},
) {
  const team = TEAM.map((m) => ({ ...m }));
  const calls: { fn: string; body: Record<string, unknown> }[] = [];
  await page.clock.setFixedTime(NOW); // 17 Nov 2026, 12:00 UTC
  await stubSupabase(page, { role: opts.role ?? "admin", full_name: "Fatima Noor" });
  await signInAs(page);

  await page.route("**/rest/v1/rpc/team_members", (r) =>
    r.fulfill(
      json(
        [...team].sort(
          (a, b) =>
            Number(!!a.disabled_at) - Number(!!b.disabled_at) || a.role.localeCompare(b.role),
        ),
      ),
    ),
  );
  for (const fn of ["set_member_role", "set_member_access"]) {
    await page.route(`**/rest/v1/rpc/${fn}`, (r) => {
      const body = r.request().postDataJSON() as Record<string, unknown>;
      calls.push({ fn, body });
      if (opts.refuse) return r.fulfill(json({ code: "P0001", message: opts.refuse }, 400));
      const m = team.find((x) => x.id === body.p_user)!;
      if (fn === "set_member_role") m.role = body.p_role as Row["role"];
      else m.disabled_at = body.p_active ? null : NOW.toISOString();
      return r.fulfill({ status: 204, body: "" });
    });
  }
  await page.route("**/rest/v1/rpc/usage_sizes", (r) =>
    r.fulfill(
      json({
        database_bytes: 42 * 1024 * 1024,
        storage_bytes: { "post-thumbs": 70 * 1024 * 1024, "idea-images": 16 * 1024 * 1024 },
      }),
    ),
  );
  await page.route("**/rest/v1/usage_meters**", (r) =>
    r.fulfill(
      json({
        value: { remaining_requests: 962, limit_requests: 1000, reset_requests: "20h" },
        updated_at: "2026-11-17T10:00:00Z",
      }),
    ),
  );
  const LATEST = { id: "pull-new", started_at: "2026-11-16T16:20:00Z", status: "done" };
  const PREVIOUS = { id: "pull-old", started_at: "2026-11-06T10:00:00Z", status: "done" };
  await page.route("**/rest/v1/pulls**", (r) => {
    const url = r.request().url();
    if (url.includes("status=eq.running")) return r.fulfill(json(null));
    const single = (r.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    if (opts.noPull) return r.fulfill(json(single ? null : []));
    // Honour limit=1 like PostgREST (maybeSingle() errors on more than one row).
    const list = url.includes("limit=1") ? [LATEST] : [LATEST, PREVIOUS];
    return r.fulfill(json(single ? LATEST : list));
  });
  // HEAD …?count=exact → "Content-Range: */N" (post counts per pull, the idea count).
  const head = (r: Route, n: number) =>
    r.fulfill({
      status: 200,
      // Cross-origin: the browser only shows Content-Range when it's exposed (Supabase does that).
      headers: {
        "content-range": `*/${n}`,
        "access-control-expose-headers": "Content-Range",
        "access-control-allow-origin": "*",
      },
      body: "",
    });
  await page.route("**/rest/v1/posts**", (r) => {
    if (r.request().method() === "HEAD")
      return head(r, r.request().url().includes("pull-old") ? 140 : 169);
    return r.fulfill(
      json([
        {
          competitor_id: "c-hims",
          platform: "tiktok",
          format: "video",
          posted_at: "2026-11-12T15:00:00Z",
          url: "https://example.com/hims/1",
          caption: "=1+1 is not a formula, it's a caption",
          hashtags: ["glp1"],
          likes: 9800,
          comments: 120,
          views: 212000,
          counts_hidden: false,
        },
      ]),
    );
  });
  await page.route("**/rest/v1/ideas**", (r) =>
    r.request().method() === "HEAD" ? head(r, 12) : r.fulfill(json([])),
  );
  await page.route("**/rest/v1/rpc/delete_all_ideas", async (r) => {
    calls.push({
      fn: "delete_all_ideas",
      body: r.request().postDataJSON() as Record<string, unknown>,
    });
    if (opts.deleteAll) return opts.deleteAll(r);
    return r.fulfill(json({ deleted: 12, image_paths: ["client-1/a.webp", "client-1/b.jpg"] }));
  });
  await page.route("**/storage/v1/object/idea-images", async (r) => {
    const { prefixes } = r.request().postDataJSON() as { prefixes: string[] };
    calls.push({ fn: "storage remove", body: { prefixes } });
    return r.fulfill(json(prefixes.map((name) => ({ name }))));
  });
  await page.route("**/rest/v1/calendar_cards**", (r) => r.fulfill(json([])));
  await page.route("**/rest/v1/holiday_cache**", (r) => {
    const year = new URL(r.request().url()).searchParams.get("year");
    const single = (r.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const row = { data: year === "eq.2026" ? us2026 : [], fetched_at: NOW.toISOString() };
    return r.fulfill(json(single ? row : [row]));
  });
  await page.route("**/functions/v1/clear-pull**", async (r) => {
    calls.push({ fn: "clear-pull", body: r.request().postDataJSON() as Record<string, unknown> });
    if (opts.clear) return opts.clear(r);
    return r.fulfill(json({ deleted: 2 }));
  });
  return { calls, team };
}

async function open(page: Page, path = "/settings") {
  await page.goto(path);
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test("Settings — Team, usage, data and account like Figma 13 (admin)", async ({ page }, info) => {
  await setup(page);
  await open(page);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  const team = page
    .getByRole("region", { name: "Team" })
    .or(page.locator("section", { hasText: "Team" }).first());
  await expect(team.getByText("Fatima Noor").first()).toBeVisible();
  await expect(page.getByText("(you)")).toBeVisible();
  await expect(page.getByText("ryan@breakthirty.com")).toBeVisible();
  await expect(page.getByText("Signed in 2 days ago")).toBeVisible(); // Ryan
  await expect(page.getByText("Signed in on 2 Nov")).toBeVisible(); // Sherry

  // Usage: used / limit, like Figma.
  await expect(page.getByText("588 left of 1,000").last()).toBeVisible(); // Firecrawl, like the sidebar
  await expect(page.getByText("38 / 1,000")).toBeVisible(); // Groq
  await expect(page.getByText("42 MB / 500 MB")).toBeVisible();
  await expect(page.getByText("86 MB / 1 GB")).toBeVisible();
  await expect(page.getByRole("meter", { name: "Database" })).toHaveAttribute(
    "aria-valuetext",
    "42 MB / 500 MB",
  );
  await expect(page.getByText("Free database pauses after 7 quiet days")).toBeVisible();
  await expect(page.getByText("Signed in as Fatima Noor")).toBeVisible();

  if (isPhone(page)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`settings-${info.project.name}.png`, { fullPage: true });
});

test("Settings — an admin makes someone an admin", async ({ page }) => {
  const { calls } = await setup(page);
  await open(page);
  await page.getByRole("button", { name: /Role for Ryan/ }).click();
  await page.getByRole("option", { name: "Admin" }).click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ fn: "set_member_role", body: { p_user: "u-ryan", p_role: "admin" } });
});

test("Settings — never zero admins: the only admin can't step down", async ({ page }) => {
  const { calls } = await setup(page);
  await open(page);
  await page.getByRole("button", { name: /Role for Fatima Noor/ }).click();
  await page.getByRole("option", { name: "Member" }).click();
  await expect(
    page.getByText("30reach needs at least one admin. Make someone else an admin first."),
  ).toBeVisible();
  expect(calls).toEqual([]); // refused before asking the server
  // Your own menu has no "Remove access…".
  await page.getByRole("button", { name: /Role for Fatima Noor/ }).click();
  await expect(page.getByRole("option", { name: "Remove access…" })).toHaveCount(0);
});

test("Settings — remove access (confirm), then restore it", async ({ page }, info) => {
  const { calls } = await setup(page);
  await open(page);
  await page.getByRole("button", { name: /Role for Ryan/ }).click();
  await page.getByRole("option", { name: "Remove access…" }).click();
  const confirm = page.getByRole("dialog", { name: "Remove Ryan’s access?" });
  await expect(
    confirm.getByText(
      "They can’t open 30reach until an admin restores it. Their ideas, comments and cards stay.",
    ),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Remove access" }).click();
  await expect(confirm).toBeHidden();
  expect(calls[0]).toEqual({
    fn: "set_member_access",
    body: { p_user: "u-ryan", p_active: false },
  });
  // Listed under "Removed" with Restore access.
  await expect(page.getByText("Removed", { exact: true })).toBeVisible();
  await expect(page.getByText("Removed 17 Nov")).toBeVisible();
  if (isPhone(page)) await tapTargetsOk(page);
  await expect(
    page.locator("section", { hasText: "Anyone with a @breakthirty.com" }),
  ).toHaveScreenshot(`settings-team-removed-${info.project.name}.png`);
  await page.getByRole("button", { name: "Restore access" }).click();
  await expect(page.getByText("Removed", { exact: true })).toHaveCount(0);
  expect(calls[1]).toEqual({
    fn: "set_member_access",
    body: { p_user: "u-ryan", p_active: true },
  });
});

test("Settings — the server's refusal is shown in plain words", async ({ page }) => {
  await setup(page, { refuse: "last_admin" });
  await open(page);
  await page.getByRole("button", { name: /Role for Ryan/ }).click();
  await page.getByRole("option", { name: "Admin" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "30reach needs at least one admin. Make someone else an admin first.",
  );
});

test("Settings — members see roles only and can't clear the pull", async ({ page }) => {
  await setup(page, { role: "member" });
  await open(page);
  await expect(page.getByRole("button", { name: /Role for/ })).toHaveCount(0);
  await expect(page.getByText("Admin", { exact: true }).first()).toBeVisible();
  const clear = page.getByRole("button", { name: "Clear", exact: true });
  await expect(clear).toHaveAttribute("aria-disabled", "true");
  await clear.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Only admins can clear the saved pull");
  await clear.click({ force: true }); // aria-disabled: Playwright won't click it otherwise
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // "Delete all ideas" isn't offered to members at all.
  await expect(page.getByRole("button", { name: "Delete all" })).toHaveCount(0);
});

test("Settings — Clear saved pull: pick Latest / Previous / Both, each explained", async ({
  page,
}, info) => {
  const { calls } = await setup(page);
  await open(page);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Clear saved pull?" });
  await expect(confirm.getByText("Latest · 16 Nov · 169 posts")).toBeVisible();
  await expect(confirm.getByText("Previous · 6 Nov · 140 posts")).toBeVisible();
  await expect(
    confirm.getByText("The dashboards show the previous pull (6 Nov). What’s new disappears."),
  ).toBeVisible();
  await expect(
    confirm.getByText("The dashboards are empty until the next Refresh, which starts fresh."),
  ).toBeVisible();
  // Nothing is picked until the admin picks.
  await expect(confirm.getByRole("button", { name: "Clear pull" })).toBeDisabled();
  await confirm.getByRole("radio", { name: /^Previous/ }).check();
  await page.waitForTimeout(300); // dialog / sheet animation
  if (isPhone(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`settings-clear-confirm-${info.project.name}.png`);
  await confirm.getByRole("button", { name: "Clear pull" }).click();
  await expect(page.getByText("Cleared the previous pull")).toBeVisible();
  // The pull the dialog showed goes along, so a newer pull is never deleted by mistake.
  expect(calls).toEqual([
    { fn: "clear-pull", body: { clientId: "client-1", which: "previous", pullId: "pull-old" } },
  ]);
});

test("Settings — Clear both saved pulls", async ({ page }) => {
  const { calls } = await setup(page);
  await open(page);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Clear saved pull?" });
  await confirm.getByRole("radio", { name: /^Both/ }).check();
  await confirm.getByRole("button", { name: "Clear both pulls" }).click();
  await expect(page.getByText("Cleared both saved pulls")).toBeVisible();
  expect(calls).toEqual([{ fn: "clear-pull", body: { clientId: "client-1", which: "both" } }]);
});

test("Settings — Clear saved pull while a Refresh runs, or after the pulls changed", async ({
  page,
}) => {
  let n = 0;
  await setup(page, {
    clear: (r) => r.fulfill(json({ error: ++n === 1 ? "pull_running" : "pulls_changed" }, 409)),
  });
  await open(page);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Clear saved pull?" });
  await confirm.getByRole("radio", { name: /^Latest/ }).check();
  await confirm.getByRole("button", { name: "Clear pull" }).click();
  await expect(confirm.getByRole("alert")).toHaveText(
    "A Refresh is running. Try again when it’s done.",
  );
  await confirm.getByRole("button", { name: "Clear pull" }).click();
  await expect(confirm.getByRole("alert")).toHaveText(
    "The saved pulls changed meanwhile. Close this and open it again.",
  );
});

test("Settings — Delete all ideas: type the number to enable it (admins)", async ({
  page,
}, info) => {
  const { calls } = await setup(page);
  await open(page);
  await expect(
    page.getByText("Every idea on the board (12), with comments and images.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete all" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete all 12 ideas?" });
  const go = confirm.getByRole("button", { name: "Delete 12 ideas" });
  await expect(go).toBeDisabled();
  const field = confirm.getByRole("textbox", { name: "Type 12 to confirm" });
  await field.fill("11");
  await expect(go).toBeDisabled();
  await field.fill("12");
  await expect(go).toBeEnabled();
  await page.waitForTimeout(300);
  if (isPhone(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`settings-delete-all-${info.project.name}.png`);
  await go.click();
  await expect(page.getByText("Deleted all 12 ideas")).toBeVisible();
  expect(calls[0]).toEqual({
    fn: "delete_all_ideas",
    body: { p_client: "client-1", p_expected: 12 },
  });
  // Images go right after (comments went with the ideas in the database).
  await expect
    .poll(() => calls.find((c) => c.fn === "storage remove")?.body)
    .toEqual({
      prefixes: ["client-1/a.webp", "client-1/b.jpg"],
    });
});

test("Settings — Delete all ideas refuses if the board changed meanwhile", async ({ page }) => {
  await setup(page, {
    deleteAll: (r) =>
      r.fulfill(json({ code: "P0001", message: "count_changed", details: "13" }, 400)),
  });
  await open(page);
  await page.getByRole("button", { name: "Delete all" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete all 12 ideas?" });
  await confirm.getByRole("textbox", { name: "Type 12 to confirm" }).fill("12");
  await confirm.getByRole("button", { name: "Delete 12 ideas" }).click();
  await expect(confirm.getByRole("alert")).toHaveText(
    "The board changed: it has 13 ideas now. Type the new number.",
  );
});

test("Settings — Export menu: one CSV per option, built in the browser", async ({ page }, info) => {
  await setup(page);
  await open(page);
  await page.getByRole("button", { name: "Export" }).click();
  const menu = page.getByRole("list", { name: "Export as CSV" });
  await expect(menu.getByRole("button")).toHaveCount(4);
  await expect(menu.getByText("Calendar events")).toBeVisible();
  await expect(
    menu.getByText("Holidays, health months, marketing dates · this month + 3"),
  ).toBeVisible();
  if (isPhone(page)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`settings-export-menu-${info.project.name}.png`);

  // Posts (latest pull): brand names, formula-safe captions.
  const [posts] = await Promise.all([
    page.waitForEvent("download"),
    menu.getByRole("button", { name: /Posts/ }).click(),
  ]);
  expect(posts.suggestedFilename()).toBe("30reach-obu-health-posts-2026-11-17.csv");
  const text = readFileSync((await posts.path())!, "utf8");
  expect(text.startsWith("﻿Brand,Platform,Format")).toBe(true);
  expect(text).toContain("Hims,tiktok,video,2026-11-12T15:00:00Z,9800,120,212000,no,");
  expect(text).toContain(`"'=1+1 is not a formula, it's a caption"`);

  // Calendar events: code rules + Nager, this month + 3 (Thanksgiving is in November).
  await page.getByRole("button", { name: "Export" }).click();
  const [events] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("list", { name: "Export as CSV" })
      .getByRole("button", { name: /Calendar events/ })
      .click(),
  ]);
  expect(events.suggestedFilename()).toBe("30reach-obu-health-calendar-events-2026-11-17.csv");
  const ev = readFileSync((await events.path())!, "utf8");
  expect(ev).toContain("2026-11-26,2026-11-26,Thanksgiving Day,Holiday");
  expect(ev).toContain("Christmas");
});

test("Settings — Posts export without a saved pull says so", async ({ page }) => {
  await setup(page, { noPull: true });
  await open(page);
  await page.getByRole("button", { name: "Export" }).click();
  await page
    .getByRole("list", { name: "Export as CSV" })
    .getByRole("button", { name: /Posts/ })
    .click();
  await expect(page.getByText("No saved pull yet")).toBeVisible();
});

test("Access removed — is_team() is false: Blip/Error screen with Sign out", async ({
  page,
}, info) => {
  await setup(page);
  // Last registered route wins: this account's access was removed.
  await page.route("**/rest/v1/rpc/is_team", (r) => r.fulfill(json(false)));
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/access-removed$/);
  await expect(page.getByRole("heading", { name: "Your access was removed" })).toBeVisible();
  await expect(
    page.getByText(
      "fatima.noor@breakthirty.com can’t use 30reach any more. Ask an admin to restore it.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if (isPhone(page)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`access-removed-${info.project.name}.png`);
});

test("Settings — a failed export says so", async ({ page }) => {
  await setup(page);
  await page.route("**/rest/v1/posts**", (r) =>
    r.request().method() === "GET" ? r.fulfill(json({ message: "boom" }, 500)) : r.fallback(),
  );
  await open(page);
  await page.getByRole("button", { name: "Export" }).click();
  await page
    .getByRole("list", { name: "Export as CSV" })
    .getByRole("button", { name: /Posts/ })
    .click();
  await expect(page.getByText("Couldn’t export that")).toBeVisible();
});
