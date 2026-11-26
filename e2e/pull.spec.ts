import { expect, test, type Page, type Route } from "@playwright/test";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk, appUrl } from "./helpers";

/*
 * Slice 5 pull UI with every Supabase / Edge Function call answered locally — 0 Firecrawl credits.
 * 05 confirm · 05b/M04 pulling · 05c progress button · 05d complete · 05f not enough · 05g problems · resume.
 */

const BRANDS = ["Found", "Hers", "Hims", "LifeMD", "Ro", "WeightWatchers"];
const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const preview = (remaining: number, status: "preview" | "insufficient" = "preview") => ({
  status,
  estimate: {
    perPlatform: {
      instagram: { tasks: 6, expected: 36, max: 48 },
      tiktok: { tasks: 6, expected: 24, max: 48 },
    },
    expected: 60,
    max: 96,
  },
  credits: { remaining, plan: 1000, periodStart: null, resetsAt: "2026-12-01T12:00:00Z" },
  lastPullAt: null,
  brands: 6,
  pageCap: 4,
  windowDays: 30,
  isTest: false,
});

const tasks = (doneCount = 0) =>
  ["instagram", "tiktok"].flatMap((platform, pi) =>
    BRANDS.map((brand, bi) => ({
      id: `t-${platform}-${brand}`,
      platform,
      status: pi * 6 + bi < doneCount ? "done" : "queued",
      pages: pi * 6 + bi < doneCount ? 2 : 0,
      posts_found: pi * 6 + bi < doneCount ? 19 : 0,
      credits_used: pi * 6 + bi < doneCount ? 4 : 0,
      error_code: null,
      competitor_id: `c-${brand}`,
      competitors: { name: brand },
    })),
  );

async function setup(page: Page) {
  await stubSupabase(page);
  await signInAs(page);
  await page.route("**/rest/v1/pull_tasks**", (r) => r.fulfill(json(tasks())));
}

/** Holds pull-task calls after the first `free` ones until release() — for a stable mid-pull state. */
function gatePullTask(page: Page, free: number) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  void page.route("**/functions/v1/pull-task**", async (route: Route) => {
    const { taskId } = route.request().postDataJSON();
    if (++calls > free) await gate;
    await route.fulfill(
      json({
        taskId,
        status: "done",
        more: false,
        pages: 2,
        postsFound: 19,
        creditsUsed: 4,
        errorCode: null,
      }),
    );
  });
  return () => release();
}

async function openRefresh(page: Page) {
  await page.goto(appUrl("/overview"));
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  // No saved pull in these stubs → Overview is 03 First run ("Pull data now"); with data it's "Refresh".
  await page
    .getByRole("button", { name: /^(Refresh|Pull data now)$/ })
    .filter({ visible: true })
    .first()
    .click();
}

test("05 / M03 confirm cost", async ({ page }) => {
  await setup(page);
  await page.route("**/functions/v1/pull-start**", (r) => r.fulfill(json(preview(1021))));
  await openRefresh(page);

  const dialog = page.getByRole("dialog", { name: "Refresh competitor data?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("~36 credits")).toBeVisible();
  await expect(dialog.getByText("~24 credits")).toBeVisible();
  await expect(dialog.getByText("up to 96 credits")).toBeVisible();
  // More than Firecrawl's plan total (extra credits): just the real number, no false "of 1,000".
  await expect(dialog.getByText("1,021", { exact: true })).toBeVisible();
  await expect(dialog.getByText("about 961")).toBeVisible();

  // Unticking TikTok updates the cost.
  await dialog.getByLabel("TikTok").uncheck();
  await expect(dialog.getByText("up to 48 credits")).toBeVisible();
  await dialog.getByLabel("TikTok").check();

  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot("refresh-confirm.png");
});

test("05 / M03 confirm cost with LinkedIn (Slice 15a)", async ({ page }) => {
  await setup(page);
  const p = preview(500);
  const withLinkedIn = {
    ...p,
    estimate: {
      perPlatform: { ...p.estimate.perPlatform, linkedin: { tasks: 6, expected: 6, max: 24 } },
      expected: 66,
      max: 120,
    },
  };
  await page.route("**/functions/v1/pull-start**", (r) => r.fulfill(json(withLinkedIn)));
  await openRefresh(page);

  const dialog = page.getByRole("dialog", { name: "Refresh competitor data?" });
  await expect(dialog.getByLabel("LinkedIn")).toBeChecked();
  await expect(dialog.getByText("~6 credits")).toBeVisible();
  await expect(dialog.getByText("up to 120 credits")).toBeVisible();
  await dialog.getByLabel("LinkedIn").uncheck();
  await expect(dialog.getByText("up to 96 credits")).toBeVisible();
  await dialog.getByLabel("LinkedIn").check();

  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot("refresh-confirm-linkedin.png");
});

test("05 / M03 confirm cost with all four platforms (Slice 16a Facebook)", async ({
  page,
}, info) => {
  await setup(page);
  const p = preview(500);
  const withFacebook = {
    ...p,
    estimate: {
      perPlatform: {
        ...p.estimate.perPlatform,
        linkedin: { tasks: 6, expected: 6, max: 24 },
        facebook: { tasks: 6, expected: 21, max: 48 },
      },
      expected: 87,
      max: 168,
    },
  };
  await page.route("**/functions/v1/pull-start**", (r) => r.fulfill(json(withFacebook)));
  await openRefresh(page);

  const dialog = page.getByRole("dialog", { name: "Refresh competitor data?" });
  await expect(dialog.getByLabel("Facebook")).toBeChecked();
  await expect(dialog.getByText("~21 credits")).toBeVisible();
  await expect(dialog.getByText("up to 168 credits")).toBeVisible();
  await dialog.getByLabel("Facebook").uncheck();
  await expect(dialog.getByText("up to 120 credits")).toBeVisible();
  await dialog.getByLabel("Facebook").check();

  await noSidewaysScroll(page);
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await expect(page).toHaveScreenshot("refresh-confirm-facebook.png");
});

test("one pull at a time across clients: Refresh says who is pulling (Slice 17a)", async ({
  page,
}, info) => {
  await setup(page);
  await page.route("**/functions/v1/pull-start**", (r) =>
    r.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ status: "other_running", clientName: "All The Best Co" }),
    }),
  );
  await openRefresh(page);
  const dialog = page.getByRole("dialog", { name: "Another pull is running" });
  await expect(dialog).toContainText(
    "All The Best Co is pulling right now. Try again in a few minutes.",
  );
  await expect(dialog.getByRole("button", { name: "Pull now" })).toHaveCount(0);
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toBeHidden();
});

test("05b / M04 pulling → 05c progress → 05d complete", async ({ page }, info) => {
  test.setTimeout(60_000); // remaining tasks run 2 at a time (paced only after a 429)
  await setup(page);
  await page.route("**/rest/v1/pull_tasks**", (r) => r.fulfill(json(tasks(5)))); // 5 of 12 done
  const startBodies: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/pull-start**", (r) => {
    const body = r.request().postDataJSON();
    startBodies.push(body);
    return r.fulfill(
      json(
        body.preview ? preview(1021) : { ...preview(1021), status: "started", pullId: "pull-1" },
      ),
    );
  });
  const release = gatePullTask(page, 0); // hold the 6th task → 42%
  await page.route("**/functions/v1/pull-finish**", (r) =>
    r.fulfill(
      json({
        status: "done",
        isTest: false,
        postsFound: 228,
        creditsUsed: 64,
        credits: { remaining: 957, plan: 1000, periodStart: null, resetsAt: null },
        problems: [],
        deleted: 0,
      }),
    ),
  );

  await openRefresh(page);
  await page.getByRole("button", { name: "Pull now" }).click();

  const card = page.getByRole("dialog", { name: "Blip’s scanning the competition…" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  // 27 Nov: one line per brand at every size, a status icon per platform (no columns to overflow).
  const list = card.getByRole("list", { name: "Pull progress by brand" });
  await expect(list.getByRole("listitem").filter({ hasText: "Found" })).toBeVisible();
  await expect(list.getByRole("img", { name: "Instagram: done" }).first()).toBeVisible();
  await expect(list.getByRole("img", { name: "TikTok: waiting" }).first()).toBeAttached();
  await noSidewaysScroll(page);
  if (info.project.name !== "mobile-390")
    await expect(card.getByText("Credits used so far · 20")).toBeVisible();
  expect(startBodies.at(-1)).toMatchObject({
    clientId: "client-1",
    platforms: ["instagram", "tiktok"],
  });
  await expect(page).toHaveScreenshot("pulling-card.png");

  // Keep working → progress moves to the Refresh button (05c) / ring (mobile).
  await card.getByRole("button", { name: "Keep working" }).click();
  await expect(card).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Pulling… 42%" }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("pulling-button.png");

  release();
  const toast = page.getByRole("status");
  await expect(toast).toContainText("Pull complete! 228 fresh posts 🎉", { timeout: 40_000 });
  // How long it took, then credits in the same words as everywhere else.
  await expect(toast).toContainText(/in \d+ (s|min) · 64 credits used · 957 left of 1,000/);
  await expect(
    page
      .getByRole("button", { name: /^(Refresh|Pull data now)$/ })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("pull-complete.png");
});

test("05f not enough credits: the same picker, as many platforms as fit, with a warning (18b)", async ({
  page,
}) => {
  await setup(page);
  const started: unknown[] = [];
  await page.route("**/functions/v1/pull-start**", (r) => {
    const body = r.request().postDataJSON();
    if (!body.preview) started.push(body.platforms);
    return r.fulfill(json(preview(64, "insufficient")));
  });
  await openRefresh(page);

  const dialog = page.getByRole("dialog", { name: "Not enough credits for a full pull" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      "You have 64 credits left until 1 Dec. Untick platforms until it fits; they keep their last data.",
    ),
  ).toBeVisible();
  // As many as fit, in the usual order: Instagram (48) fits, TikTok (48 more) doesn't.
  await expect(dialog.getByLabel("Instagram")).toBeChecked();
  await expect(dialog.getByLabel("TikTok")).not.toBeChecked();
  await expect(dialog.getByText("Not pulled this time")).toBeVisible(); // no saved pull in these stubs
  await expect(dialog.getByText("up to 48 credits")).toBeVisible();
  const pullNow = dialog.getByRole("button", { name: "Pull now" });
  await expect(pullNow).toBeEnabled();
  // Ticking TikTok too doesn't fit: the total turns red and Pull now waits.
  await dialog.getByLabel("TikTok").check();
  await expect(dialog.getByText("up to 96 credits")).toBeVisible();
  await expect(pullNow).toBeDisabled();
  await dialog.getByLabel("TikTok").uncheck();
  await expect(page).toHaveScreenshot("not-enough-credits.png");
  await pullNow.click();
  await expect.poll(() => started).toEqual([["instagram"]]);
});

test("YouTube in the Refresh dialog: free, and today's daily limit (18b)", async ({ page }) => {
  await setup(page);
  await page.route("**/functions/v1/pull-start**", (r) =>
    r.fulfill(
      json({
        ...preview(1021),
        youtubeLimitToday: true,
        estimate: {
          ...preview(1021).estimate,
          perPlatform: {
            ...preview(1021).estimate.perPlatform,
            youtube: { tasks: 2, expected: 0, max: 0 },
          },
        },
      }),
    ),
  );
  await openRefresh(page);
  const dialog = page.getByRole("dialog", { name: "Refresh competitor data?" });
  // "free", with an ⓘ that says why.
  await expect(dialog.getByText(/^free/).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Why YouTube is free" })).toBeVisible();
  // The limit already ran out today: YouTube starts unticked, and says why.
  await expect(dialog.getByRole("checkbox", { name: /^YouTube/ })).not.toBeChecked();
  await expect(
    dialog.getByText("YouTube’s free daily limit ran out. YouTube will work again tomorrow."),
  ).toBeVisible();
  await expect(dialog.getByLabel("Instagram")).toBeChecked();
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot("refresh-youtube-limit.png");
});

test("YouTube's daily limit during a pull: the toast says the rest was pulled (18b)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page);
  await page.route("**/rest/v1/pull_tasks**", (r) => r.fulfill(json(tasks(11))));
  await page.route("**/functions/v1/pull-start**", (r) => {
    const body = r.request().postDataJSON();
    return r.fulfill(
      json(
        body.preview ? preview(1021) : { ...preview(1021), status: "started", pullId: "pull-1" },
      ),
    );
  });
  gatePullTask(page, 99);
  await page.route("**/functions/v1/pull-finish**", (r) =>
    r.fulfill(
      json({
        status: "partial",
        isTest: false,
        postsFound: 201,
        creditsUsed: 62,
        credits: null,
        problems: [
          { brand: "Ro", platform: "youtube", code: "quota" },
          { brand: "Hims", platform: "youtube", code: "quota" },
        ],
        deleted: 1,
        carried: { youtube: "2026-11-16T16:20:00Z" },
      }),
    ),
  );
  await openRefresh(page);
  await page.getByRole("button", { name: "Pull now" }).click();
  const toast = page.getByRole("status").filter({ hasText: "problem" });
  await expect(toast).toContainText(
    "YouTube’s free daily limit ran out. The other platforms were pulled. YouTube will work again tomorrow.",
  );
  await expect(toast).not.toContainText("Everything else updated");
});

test("05g finished with problems → Fix handle", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page);
  await page.route("**/rest/v1/pull_tasks**", (r) => r.fulfill(json(tasks(11)))); // 1 task left
  await page.route("**/functions/v1/pull-start**", (r) => {
    const body = r.request().postDataJSON();
    return r.fulfill(
      json(
        body.preview ? preview(1021) : { ...preview(1021), status: "started", pullId: "pull-1" },
      ),
    );
  });
  gatePullTask(page, 99);
  await page.route("**/functions/v1/pull-finish**", (r) =>
    r.fulfill(
      json({
        status: "partial",
        isTest: false,
        postsFound: 201,
        creditsUsed: 62,
        credits: null,
        problems: [{ brand: "Found", platform: "tiktok", code: "not_found" }],
        deleted: 1,
      }),
    ),
  );
  await openRefresh(page);
  await page.getByRole("button", { name: "Pull now" }).click();

  const toast = page.getByRole("status");
  await expect(toast).toContainText("Pull finished with 1 problem");
  await expect(toast).toContainText("Found’s TikTok handle wasn’t found. Everything else updated.");
  await expect(page).toHaveScreenshot("pull-problems.png");
  await toast.getByRole("button", { name: "Fix handle" }).click();
  // Opens Found's 07b panel, cursor in the TikTok field.
  await expect(page).toHaveURL(/\/competitors\?edit=c-found&focus=tiktok$/);
  await expect(page.getByRole("dialog", { name: "Edit Found" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "TikTok" })).toBeFocused();
});

test("resume after a reload", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page);
  await page.route("**/rest/v1/pulls**", (r) =>
    r.fulfill(
      json({
        id: "pull-9",
        client_id: "client-1",
        clients: { slug: "obu-health", name: "OBU Health" },
      }),
    ),
  );
  await page.route("**/rest/v1/pull_tasks**", (r) => r.fulfill(json(tasks(6))));
  await page.goto(appUrl("/overview"));

  const toast = page.getByRole("status");
  await expect(toast).toContainText("Your last pull didn’t finish");
  await expect(toast).toContainText("50% done · nothing is lost");
  await expect(page.getByRole("button", { name: "Resume pull · 50%" })).toBeVisible();
});

test("Firecrawl 429 → slow-down toast, then carries on by itself", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page);
  await page.route("**/rest/v1/pull_tasks**", (r) => r.fulfill(json(tasks(11))));
  await page.route("**/functions/v1/pull-start**", (r) => {
    const body = r.request().postDataJSON();
    return r.fulfill(
      json(
        body.preview ? preview(1021) : { ...preview(1021), status: "started", pullId: "pull-1" },
      ),
    );
  });
  let calls = 0;
  await page.route("**/functions/v1/pull-task**", (r) => {
    const { taskId } = r.request().postDataJSON();
    return r.fulfill(
      ++calls === 1
        ? json({ error: "rate_limited", retryable: true, retryAfter: 1 }, 429)
        : json({
            taskId,
            status: "done",
            more: false,
            pages: 1,
            postsFound: 9,
            creditsUsed: 2,
            errorCode: null,
          }),
    );
  });
  await page.route("**/functions/v1/pull-finish**", (r) =>
    r.fulfill(
      json({
        status: "done",
        isTest: false,
        postsFound: 9,
        creditsUsed: 2,
        credits: null,
        problems: [],
        deleted: 0,
      }),
    ),
  );
  await openRefresh(page);
  await page.getByRole("button", { name: "Pull now" }).click();
  await expect(page.getByRole("status")).toContainText("Firecrawl asked Blip to slow down");
  await expect(page.getByRole("status")).toContainText("Back in 1 s");
  await expect(page.getByRole("status")).toContainText("Pull complete", { timeout: 15_000 });
  expect(calls).toBe(2);
});

test("05d offers “See what’s new” once a previous real pull exists", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page);
  await page.route("**/rest/v1/pull_tasks**", (r) => r.fulfill(json(tasks(11)))); // 1 task left
  // Two saved real pulls → 05e is possible.
  await page.route("**/rest/v1/pulls**", (r) =>
    r.fulfill(
      json(
        r.request().url().includes("status=eq.running")
          ? null
          : [
              { id: "pull-new", started_at: "2026-11-17T10:00:00Z", status: "done" },
              { id: "pull-old", started_at: "2026-11-06T10:00:00Z", status: "done" },
            ],
      ),
    ),
  );
  await page.route("**/functions/v1/pull-start**", (r) => {
    const body = r.request().postDataJSON();
    return r.fulfill(
      json(
        body.preview ? preview(1021) : { ...preview(1021), status: "started", pullId: "pull-new" },
      ),
    );
  });
  gatePullTask(page, 99);
  await page.route("**/functions/v1/pull-finish**", (r) =>
    r.fulfill(
      json({
        status: "done",
        isTest: false,
        postsFound: 169,
        creditsUsed: 48,
        credits: null,
        problems: [],
        deleted: 1,
      }),
    ),
  );
  await openRefresh(page);
  await page.getByRole("button", { name: "Pull now" }).click();
  const toast = page.getByRole("status");
  await expect(toast).toContainText("Pull complete");
  await toast.getByRole("button", { name: "See what’s new" }).click();
  await expect(page).toHaveURL(/\/overview$/);
});

test("nothing to pull: first run says why and offers Add competitors", async ({ page }, info) => {
  await setup(page);
  await page.route("**/rest/v1/competitors**", (r) => r.fulfill(json([])));
  await page.goto(appUrl("/overview"));
  await expect(page.getByText("No competitors yet")).toBeVisible();
  await expect(page.getByText("Competitors set")).toHaveCount(0);
  const pull = page.getByRole("button", { name: "Pull data now" });
  await expect(pull).toBeDisabled();
  await expect(pull).toHaveAccessibleDescription(
    "OBU Health has no competitors with accounts yet. Add one to run a pull.",
  );
  await expect(page.getByRole("link", { name: "Add competitors" })).toHaveAttribute(
    "href",
    "/c/obu-health/competitors?add=1",
  );
  await page.evaluate(() => document.fonts.ready);
  await noSidewaysScroll(page);
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`first-run-no-competitors-${info.project.name}.png`, {
    fullPage: true,
  });
});

test("nothing to pull: competitors without accounts on tracked platforms", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page);
  await page.route("**/rest/v1/competitors**", (r) =>
    r.fulfill(
      json([
        {
          id: "c-ro",
          name: "Ro",
          initials: "Ro",
          instagram_handle: null,
          tiktok_handle: null,
          linkedin_url: null,
          facebook_url: null,
        },
      ]),
    ),
  );
  await page.goto(appUrl("/overview"));
  await expect(page.getByText("No competitor accounts yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pull data now" })).toBeDisabled();
});

test("nothing to pull: the Refresh dialog explains (pull-start no_accounts)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page);
  await page.route("**/functions/v1/pull-start**", (r) =>
    r.fulfill(json({ error: "no_accounts" }, 400)),
  );
  await openRefresh(page);
  const dialog = page.getByRole("dialog", { name: "Refresh competitor data?" });
  await expect(dialog).toContainText(
    "OBU Health has no competitors with accounts yet. Add one to run a pull.",
  );
  await expect(dialog).not.toContainText("Couldn’t estimate the cost.");
  await dialog.getByRole("button", { name: "Add competitors" }).click();
  await expect(page).toHaveURL(/\/c\/obu-health\/competitors\?add=1$/);
});
