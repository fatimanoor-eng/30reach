import { expect, test, type Page } from "@playwright/test";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk } from "./helpers";
import { BRANDS, makePosts, NOW, solidPng } from "./overview-fixtures";

/*
 * Slice 6 Overview with fixed fake data — nothing reaches Supabase or Firecrawl.
 * Clock pinned to 17 Nov 2026 12:00 UTC, timezone UTC, so "Last pulled" and stale state are stable.
 */
test.use({ timezoneId: "UTC" });

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const LATEST = { id: "pull-new", started_at: "2026-11-16T16:20:00Z", status: "done" };
const PREVIOUS = { id: "pull-old", started_at: "2026-11-06T10:00:00Z", status: "done" };

async function setup(
  page: Page,
  pulls: (typeof LATEST)[],
  opts: { boost?: Record<string, number>; counts?: Record<string, number> } = {},
) {
  await page.clock.setFixedTime(NOW);
  await stubSupabase(page);
  await signInAs(page);
  await page.route("**/rest/v1/competitors**", (r) => r.fulfill(json(BRANDS)));
  await page.route("**/rest/v1/pulls**", (r) =>
    r.fulfill(json(r.request().url().includes("status=eq.running") ? null : pulls)),
  );
  const postsByPull: Record<string, unknown[]> = {
    // Hims leads now; previously Hers led → "Hims moved up to #1". New posts carry a new prefix.
    [LATEST.id]: makePosts(LATEST.id, new Date(LATEST.started_at), {
      boost: { "c-hims": 1.6, ...opts.boost },
      withThumbs: true,
      extraTag: "menopause", // only in the latest pull → "new tag #menopause"
      counts: opts.counts,
    }),
    [PREVIOUS.id]: makePosts(PREVIOUS.id, new Date(PREVIOUS.started_at), {
      prefix: "old-",
      boost: { "c-hers": 1.4 },
    }).map((p, i) => (i % 3 === 0 ? { ...p, external_id: p.external_id.replace("old-", "") } : p)),
  };
  await page.route("**/rest/v1/posts**", (r) => {
    const pullId = new URL(r.request().url()).searchParams.get("pull_id")?.replace("eq.", "") ?? "";
    return r.fulfill(json(postsByPull[pullId] ?? []));
  });
  // Thumbnails: POST …/object/sign/post-thumbs creates signed URLs; GET on a signed URL returns the image.
  await page.route("**/storage/v1/object/sign/post-thumbs**", async (r) => {
    if (r.request().method() === "POST") {
      const { paths } = r.request().postDataJSON() as { paths: string[] };
      return r.fulfill(
        json(
          paths.map((path) => ({
            path,
            signedURL: `/object/sign/post-thumbs/${path}?token=test`,
            error: null,
          })),
        ),
      );
    }
    return r.fulfill({
      status: 200,
      contentType: "image/png",
      body: solidPng(48, 60, [196, 186, 172]),
    });
  });
}

async function ready(page: Page, path = "/overview") {
  await page.goto(path);
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test("03 first run (no real pull yet)", async ({ page }, info) => {
  await setup(page, []);
  await ready(page);
  await expect(page.getByRole("heading", { level: 1, name: "Run your first pull" })).toBeVisible();
  await expect(
    page.getByText("6 brands: Found, Hers, Hims, LifeMD, Ro, WeightWatchers"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Pull data now" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review competitors" })).toBeVisible();
  await noSidewaysScroll(page);
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await expect(page).toHaveScreenshot("first-run.png", { fullPage: true });
});

test("04 overview + 05e what's new", async ({ page }, info) => {
  await setup(page, [LATEST, PREVIOUS]);
  await ready(page);

  await expect(page.getByText("Last pulled 16 Nov, 16:20").filter({ visible: true })).toBeVisible();
  const bar = page.getByRole("region", { name: "What's new since the last pull" });
  await expect(bar).toContainText("New since 6 Nov");
  await expect(bar).toContainText("Hims moved up to #1");
  await expect(bar).toContainText("new tag #menopause");
  // KPI label: "Posts tracked" (tablet/desktop) or "Posts" (mobile, M02).
  await expect(
    page
      .getByText(/^Posts( tracked)?$/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  // NEW chip on a top post (desktop list or mobile cards — whichever is visible).
  await expect(
    page.getByText("New", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/SELECTION:/i)).toHaveCount(0);

  await noSidewaysScroll(page);
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await expect(page).toHaveScreenshot("overview.png", { fullPage: true });
});

test("stale data (> 7 days) is amber", async ({ page }) => {
  await setup(page, [{ ...LATEST, id: "pull-new", started_at: "2026-11-07T09:00:00Z" }]);
  await ready(page);
  const stale = page.getByText("Last pulled 7 Nov · 10 days ago").filter({ visible: true });
  await expect(stale).toBeVisible();
  await expect(stale).toHaveCSS("color", "rgb(178, 107, 0)"); // --color-amber-text
  await expect(page.getByRole("region", { name: "What's new since the last pull" })).toHaveCount(0);
  await expect(page).toHaveScreenshot("overview-stale.png");
});

test("compare mode (2 brands) and one brand", async ({ page }, info) => {
  await setup(page, [LATEST]);
  await ready(page);
  const pills = page.getByRole("group", { name: "Brands" });
  await pills.getByRole("button", { name: "Hims", exact: true }).click();
  await expect(page.getByText("Posting rate", { exact: true })).toBeVisible();

  await pills.getByRole("button", { name: "Ro", exact: true }).click();
  await expect(page.getByText("Most active", { exact: true })).toBeVisible();
  if (info.project.name !== "mobile-390") {
    // Captions are hidden on mobile (M02).
    await expect(page.getByText("Across 2 brands, both platforms")).toBeVisible();
  }
  await expect(page).toHaveScreenshot("overview-compare.png", { fullPage: true });
});

test("date range filter, 90 days disabled", async ({ page }, info) => {
  await setup(page, [LATEST]);
  await ready(page);

  if (info.project.name === "mobile-390") {
    const select = page.getByRole("combobox", { name: "Date range" }); // the mobile select
    await select.selectOption("7");
    await expect(page).toHaveURL(/days=7/);
    await expect(select.locator('option[value="90"]')).toBeDisabled();
  } else {
    await page.getByRole("radio", { name: "7 days" }).click();
    await expect(page).toHaveURL(/days=7/);
    const ninety = page.getByRole("radio", { name: "90 days" });
    await expect(ninety).toHaveAttribute("aria-disabled", "true");
    await ninety.hover();
    await expect(
      page.getByRole("tooltip", { name: "Needs a 90-day pull, coming later" }),
    ).toBeVisible();
    await ninety.click({ force: true }); // Playwright waits on aria-disabled; force it to prove nothing happens
    await expect(page).toHaveURL(/days=7/); // unchanged
  }
});

test("platform switch navigates and keeps brands + date range", async ({ page }, info) => {
  await setup(page, [LATEST]);
  await ready(page, "/overview?days=7");
  await page.getByRole("group", { name: "Brands" }).getByRole("button", { name: "Hims" }).click();
  await page.getByRole("radio", { name: "TikTok" }).click();
  await expect(page).toHaveURL(/\/tiktok\?days=7$/);
  // Mobile: the Social tab's Instagram | TikTok switch; tablet/desktop: Both / Instagram / TikTok.
  await expect(
    page.getByRole("radio", { name: "TikTok", checked: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Brands" }).getByRole("button", { name: "Hims" }),
  ).toHaveAttribute("aria-pressed", "true");
  if (info.project.name === "mobile-390") {
    await page.getByRole("radio", { name: "Instagram" }).click();
    await expect(page).toHaveURL(/\/instagram\?days=7$/);
  } else {
    await page.getByRole("radio", { name: "Both" }).click();
    await expect(page).toHaveURL(/\/overview\?days=7$/);
    await expect(page.getByRole("radio", { name: "Both", checked: true })).toBeVisible();
  }
});

test("Top posts links open the platform page with all posts expanded", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page, [LATEST]);
  await ready(page, "/overview?days=7");
  await page.getByRole("group", { name: "Brands" }).getByRole("button", { name: "Hims" }).click();
  const card = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Top posts", exact: true }) });
  await expect(card.getByRole("button", { name: /See all|Show less/ })).toHaveCount(0);
  const ig = card.getByRole("link", { name: "All Instagram posts" }).filter({ visible: true });
  const tt = card.getByRole("link", { name: "All TikTok posts" }).filter({ visible: true });
  await expect(ig).toHaveCount(1);
  await expect(tt).toHaveCount(1);
  if (mobile) {
    // Stacked under the sideways cards.
    const cards = await card.locator("article").filter({ visible: true }).last().boundingBox();
    const [a, b] = [await ig.boundingBox(), await tt.boundingBox()];
    expect(a!.y).toBeGreaterThan(cards!.y + cards!.height - 1);
    expect(b!.y).toBeGreaterThan(a!.y);
    await tapTargetsOk(page);
  }
  await noSidewaysScroll(page);

  await ig.click(); // Hims has Instagram posts in the last 7 days of this fixture
  await expect(page).toHaveURL(/\/instagram\?days=7&posts=all$/);
  const social = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Top posts on Instagram" }) });
  const showLess = social.getByRole("button", { name: "Show less" }).first();
  await expect(showLess).toHaveAttribute("aria-expanded", "true");
  await expect(showLess).toBeInViewport();
  // Not hidden under the sticky mobile app bar.
  expect((await showLess.boundingBox())!.y).toBeGreaterThan(mobile ? 64 : 0);
  await expect(
    page.getByRole("group", { name: "Brands" }).getByRole("button", { name: "Hims" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveScreenshot("overview-to-instagram-all.png");
});

test("dismissing what's new hides it until the next pull", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page, [LATEST, PREVIOUS]);
  await ready(page);
  const bar = page.getByRole("region", { name: "What's new since the last pull" });
  await bar.getByRole("button", { name: "Hide until the next pull" }).click();
  await expect(bar).toHaveCount(0);
  await page.reload();
  await page.locator("h1").first().waitFor();
  await expect(page.getByText("Leaderboard")).toBeVisible();
  await expect(bar).toHaveCount(0);
});

test("Save as idea — 06d / M10 dialog, post attached, thumbnail copied", async ({ page }, info) => {
  await setup(page, [LATEST]);
  // Every post gets a thumbnail here (the fixtures give one only to each brand's first two).
  const posts = makePosts(LATEST.id, new Date(LATEST.started_at), { withThumbs: true }).map(
    (p, i) => ({ ...p, thumbnail_path: `client-1/${LATEST.id}/thumb-${i}.jpg` }),
  );
  await page.route("**/rest/v1/posts**", (r) => r.fulfill(json(posts)));
  const inserts: Record<string, unknown>[] = [];
  const uploads: { path: string; bytes: number; type: string }[] = [];
  await page.route("**/rest/v1/ideas**", (r) => {
    if (r.request().method() !== "POST") return r.fulfill(json([]));
    inserts.push(r.request().postDataJSON() as Record<string, unknown>);
    return r.fulfill({ status: 201, body: "" });
  });
  await page.route("**/storage/v1/object/idea-images/**", (r) => {
    const body = r.request().postDataBuffer() ?? Buffer.alloc(0);
    uploads.push({
      path: decodeURIComponent(new URL(r.request().url()).pathname.split("/idea-images/")[1]),
      bytes: body.length,
      type: body.includes("image/webp") ? "webp" : body.includes("image/jpeg") ? "jpeg" : "?",
    });
    return r.fulfill(json({ Key: "x", Id: "x" }));
  });
  await ready(page);

  // A post with a thumbnail.
  const post = page
    .locator("article")
    .filter({ has: page.locator("img") })
    .filter({ visible: true })
    .first();
  const caption = (await post.locator("p.line-clamp-2").innerText()).trim();
  await post.getByRole("button", { name: "Save as idea" }).click();
  const dialog = page.getByRole("dialog", { name: "Save to idea board" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(caption)).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Your idea" })).toBeFocused();
  await expect(
    dialog.getByText("Instagram", { exact: true }).or(dialog.getByText("TikTok", { exact: true })),
  ).toBeVisible();
  await dialog.getByRole("textbox", { name: "Your idea" }).fill("OBU version for month one");
  await dialog.getByRole("button", { name: "+ tag" }).click();
  await dialog.getByRole("textbox", { name: "New tag" }).fill("Hook");
  await dialog.getByRole("textbox", { name: "New tag" }).press("Enter");
  await page.waitForTimeout(300); // sheet slide-in on phones
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`save-as-idea-${info.project.name}.png`);

  await dialog.getByRole("button", { name: "Save idea" }).click();
  await expect(page.getByText("Saved to idea board")).toBeVisible();
  await expect(dialog).toBeHidden();

  const row = inserts[0];
  expect(row).toMatchObject({
    client_id: "client-1",
    kind: "post",
    note: "OBU version for month one",
    tags: ["Hook"],
    source_snapshot: expect.objectContaining({ caption, saved_from: "overview" }),
  });
  expect(row.source_post_id).toEqual(expect.any(String));
  expect(["instagram", "tiktok"]).toContain(row.platform);
  // The thumbnail is copied (compressed) into idea-images and kept with the idea.
  expect(uploads).toHaveLength(1);
  expect(uploads[0].path).toBe(`client-1/${String(row.id)}.webp`);
  expect(uploads[0].type).toBe("webp");
  expect(row).toMatchObject({ image_path: uploads[0].path, image_width: 48, image_height: 60 });

  // "Open" goes to the new idea on the board.
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/ideas\\?idea=${String(row.id)}$`));
});

test("Open post opens the original", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page, [LATEST]);
  await ready(page);
  const open = page.getByRole("link", { name: /Open post/ }).first();
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("href", /^https:\/\/example\.com\//);
});

test("leaderboard row selects that brand's pill", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "behaviour check, once");
  await setup(page, [LATEST]);
  await ready(page);
  await page.getByRole("table").getByRole("button", { name: /Ro$/ }).click();
  await expect(
    page.getByRole("group", { name: "Brands" }).getByRole("button", { name: "Ro", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("KPI tiles: values never cut off, all the same height", async ({ page }, info) => {
  // WeightWatchers is most active → the longest value lands in a tile.
  await setup(page, [LATEST], { counts: { "c-ww": 14 } });
  await ready(page);
  await expect(
    page.getByText("WeightWatchers", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();

  const tiles = page.locator(".\\@container");
  await expect(tiles).toHaveCount(4);
  const report = await tiles.evaluateAll((els) =>
    els.map((el) => {
      const value = el.querySelector<HTMLElement>("[title]")!;
      return {
        text: value.textContent,
        cutOff: value.scrollWidth > value.clientWidth + 1,
        height: Math.round(el.getBoundingClientRect().height),
      };
    }),
  );
  expect(
    report.filter((r) => r.cutOff),
    "KPI values cut off",
  ).toEqual([]);
  expect(report.map((r) => r.text)).toContain("WeightWatchers");
  expect(new Set(report.map((r) => r.height)).size, `heights ${report.map((r) => r.height)}`).toBe(
    1,
  );
  // Best time: short value; meridiem in the caption (or the mobile suffix).
  expect(report[3].text).toMatch(/^[A-Z][a-z]{2} \d{1,2}–\d{1,2}$/);
  await expect(page).toHaveScreenshot(`kpis-long-values.png`, { fullPage: false });
  void info;
});
