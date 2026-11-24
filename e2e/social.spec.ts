import { expect, test, type Page } from "@playwright/test";
import {
  currentPlatform,
  noSidewaysScroll,
  pickPlatform,
  signInAs,
  stubSupabase,
  tapTargetsOk,
  appUrl,
} from "./helpers";
import {
  BRANDS,
  makeFacebookPosts,
  makeLinkedInPosts,
  makePosts,
  NOW,
  solidPng,
} from "./overview-fixtures";

/*
 * Slice 7 Social pages (06a / 06b / 06c, M05 / M06) with fixed fake data — nothing reaches Supabase
 * or Firecrawl. Clock pinned to 17 Nov 2026 12:00 UTC, timezone UTC.
 */
test.use({ timezoneId: "UTC" });

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const LATEST = { id: "pull-new", started_at: "2026-11-16T16:20:00Z", status: "done" };

async function setup(
  page: Page,
  pulls: (typeof LATEST)[] = [LATEST],
  /** Slice 16b: WeightWatchers and Ro have Facebook pages (and posts). Off = nobody has one. */
  opts: { facebook?: boolean } = {},
) {
  await page.clock.setFixedTime(NOW);
  await stubSupabase(page);
  await signInAs(page);
  await page.route("**/rest/v1/competitors**", (r) =>
    r.fulfill(
      json(
        BRANDS.map((b) => ({
          ...b,
          instagram_handle: "x",
          tiktok_handle: "x",
          // Found has no LinkedIn page (the "no LinkedIn page" empty state).
          linkedin_url: b.id === "c-found" ? null : `https://www.linkedin.com/company/${b.id}/`,
          facebook_url:
            opts.facebook && (b.id === "c-ww" || b.id === "c-ro")
              ? `https://www.facebook.com/${b.id}`
              : null,
        })),
      ),
    ),
  );
  await page.route("**/rest/v1/pulls**", (r) =>
    r.fulfill(json(r.request().url().includes("status=eq.running") ? null : pulls)),
  );
  // 12 posts per brand so most formats reach the 3-post minimum.
  const posts = makePosts(LATEST.id, new Date(LATEST.started_at), {
    boost: { "c-hims": 1.6 },
    withThumbs: true,
    extraTag: "menopause",
    counts: Object.fromEntries(BRANDS.map((b, i) => [b.id, 12 - i])),
  });
  // LinkedIn posts ride along: the Instagram / TikTok pages must ignore them (Slice 15b).
  const linkedIn = makeLinkedInPosts(LATEST.id, new Date(LATEST.started_at), {
    withThumbs: true,
  }).filter((p) => p.competitor_id !== "c-found");
  const facebook = opts.facebook
    ? makeFacebookPosts(LATEST.id, new Date(LATEST.started_at), { withThumbs: true })
    : [];
  await page.route("**/rest/v1/posts**", (r) =>
    r.fulfill(json([...posts, ...linkedIn, ...facebook])),
  );
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
      body: solidPng(64, 48, [196, 186, 172]),
    });
  });
}

async function ready(page: Page, path: string) {
  await page.goto(appUrl(path));
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

const pill = (page: Page, name: string) =>
  page.getByRole("group", { name: "Brands" }).getByRole("button", { name, exact: true });

async function checks(page: Page, mobile: boolean, shot: string) {
  await noSidewaysScroll(page);
  if (mobile) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(shot, { fullPage: true });
}

test("06a / M05 Instagram — all brands", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/instagram");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
    mobile ? /Social/ : /Instagram/,
  );
  await expect(currentPlatform(page, "Instagram", mobile)).toBeVisible();
  await expect(page.getByText("Avg engagement").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top posts on Instagram" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formats" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top hashtags" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Best times to post" })).toBeVisible();
  await expect(page.getByText(/Strongest slot across all brands/)).toBeVisible();
  await expect(page.getByText("#glp1").filter({ visible: true }).first()).toBeVisible();

  await checks(page, mobile, "social-instagram.png");

  // Save as idea → the 06d dialog / M10 sheet (after the screenshot: the click scrolls the page).
  await page
    .getByRole("button", { name: "Save as idea" })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Save to idea board" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("06a TikTok — views shown, same layout", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/tiktok");
  await expect(page.getByRole("heading", { name: "Top posts on TikTok" })).toBeVisible();
  await expect(page.getByText(/views/).filter({ visible: true }).first()).toBeVisible();
  await checks(page, mobile, "social-tiktok.png");
});

test("LinkedIn page (Slice 15b/15c) — reactions, reposts, same layout, save as idea", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/linkedin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
    mobile ? /Social/ : /LinkedIn/,
  );
  await expect(page.getByRole("heading", { name: "Top posts on LinkedIn" })).toBeVisible();
  // KPI captions are hidden on phones (M05).
  if (!mobile)
    await expect(
      page.getByText(/reactions \+ comments \/ post · \d+ avg reposts/).filter({ visible: true }),
    ).toBeVisible();
  await expect(
    page
      .getByText(/reactions · \d+\scomments · \d+\sreposts/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(page.getByText("#digitalhealth").filter({ visible: true }).first()).toBeVisible();
  await checks(page, mobile, "social-linkedin.png");

  // Slice 15c: LinkedIn posts can be saved as ideas (platform + format filled in from the post).
  await page
    .getByRole("button", { name: "Save as idea" })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Save to idea board" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("LinkedIn", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Link", { exact: true })).toBeVisible(); // the top post is a link post
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("platform switch reaches LinkedIn (mobile Social tab and tablet/desktop)", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/instagram?days=7");
  await pickPlatform(page, "LinkedIn", mobile);
  await expect(page).toHaveURL(/\/linkedin\?days=7$/);
  await expect(page.getByRole("heading", { name: "Top posts on LinkedIn" })).toBeVisible();
  if (mobile) {
    await expect(page.getByRole("link", { name: "Social" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  } else {
    await page.getByRole("radio", { name: "All" }).click();
    await expect(page).toHaveURL(/\/overview\?days=7$/);
  }
});

test("Facebook page (Slice 16b) — reactions, shares, video views, 12-post cap note", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page, [LATEST], { facebook: true });
  await ready(page, "/facebook");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
    mobile ? /Social/ : /Facebook/,
  );
  await expect(page.getByRole("heading", { name: "Top posts on Facebook" })).toBeVisible();
  // KPI captions are hidden on phones (M02).
  if (!mobile)
    await expect(
      page.getByText(/reactions \+ comments \/ post · \d+ avg shares/).filter({ visible: true }),
    ).toBeVisible();
  await expect(
    page
      .getByText(/views ·/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(/\d\sshares/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Showing the latest 12 Facebook posts for WeightWatchers. A pull reads at most 12 per brand, so older posts in this range aren’t counted.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Albums").filter({ visible: true }).first()).toBeVisible();

  await expect(currentPlatform(page, "Facebook", mobile)).toBeVisible();
  await checks(page, mobile, "social-facebook.png");

  // One brand without the cap: the note goes away.
  await pill(page, "Ro").click();
  await expect(page.getByText(/Showing the latest 12 Facebook posts/)).toHaveCount(0);

  // Slice 16c: Facebook posts can be saved as ideas (platform + format filled in from the post).
  await page
    .getByRole("button", { name: "Save as idea" })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Save to idea board" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Facebook", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("platforms nobody has an account on are hidden; a direct link keeps its empty state", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile-390";
  const desktop = info.project.name === "desktop-1440";
  await setup(page); // nobody has a Facebook page
  await ready(page, "/instagram");
  if (mobile) {
    await page.getByRole("button", { name: /^Platform: / }).click();
    const sheet = page.getByRole("dialog", { name: "Platform" });
    await expect(sheet.getByRole("button")).toHaveText([
      "Instagram",
      "TikTok",
      "LinkedIn",
      "Cancel",
    ]);
    await sheet.getByRole("button", { name: "Cancel" }).click();
  } else {
    await expect(page.getByRole("radiogroup", { name: "Platform" }).getByRole("radio")).toHaveCount(
      4,
    );
    await expect(page.getByRole("radio", { name: "Facebook" })).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    await expect(nav.getByRole("link", { name: "Facebook" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "LinkedIn" })).toBeVisible();
  }

  // Straight to /facebook: the page explains, and its own segment stays so you can see where you are.
  await ready(page, "/facebook");
  await expect(page.getByText("No competitor has a Facebook page yet")).toBeVisible();
  await expect(currentPlatform(page, "Facebook", mobile)).toBeVisible();
  if (desktop) await expect(page).toHaveScreenshot("social-facebook-nobody.png");
});

test("platform switch with Facebook: desktop short labels, tablet icons, phone sheet", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page, [LATEST], { facebook: true });
  await ready(page, "/instagram?days=7");
  if (mobile) {
    await page.getByRole("button", { name: "Platform: Instagram. Change platform" }).click();
    const sheet = page.getByRole("dialog", { name: "Platform" });
    await expect(sheet.getByRole("button", { name: "Instagram" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await tapTargetsOk(page);
    await expect(page).toHaveScreenshot("platform-sheet.png");
    await sheet.getByRole("button", { name: "Facebook" }).click();
  } else {
    const fb = page.getByRole("radio", { name: "Facebook" });
    // Desktop: icon + "FB"; tablet: icon only (the name comes from aria-label, and a tooltip on hover).
    if (info.project.name === "desktop-1440") await expect(fb.getByText("FB")).toBeVisible();
    else await expect(fb.getByText("FB")).toBeHidden();
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    await expect(nav.getByRole("link", { name: "Facebook" })).toBeVisible();
    await expect(
      page.locator("main").getByRole("radiogroup", { name: "Platform" }),
    ).toHaveScreenshot("platform-switch.png");
    await fb.click();
  }
  await expect(page).toHaveURL(/\/facebook\?days=7$/);
  await expect(page.getByRole("heading", { name: "Top posts on Facebook" })).toBeVisible();
});

test("LinkedIn: a brand without a page says so", async ({ page }) => {
  await setup(page);
  await ready(page, "/linkedin");
  await pill(page, "Found").click();
  await expect(page.getByText("Found has no LinkedIn page")).toBeVisible();
});

test("06b one brand", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/instagram");
  await pill(page, "Hims").click();
  if (!mobile)
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Hims on Instagram");
  await expect(
    page.getByText(/Strongest slot for Hims|Not enough posts to pick a strongest slot/),
  ).toBeVisible();
  if (!mobile) await expect(page.getByText(/^#\d of \d brands/)).toBeVisible();
  await checks(page, mobile, "social-one-brand.png");
});

test("06c / M06 compare two brands", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/instagram");
  await pill(page, "Hims").click();
  await pill(page, "Ro").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
    mobile ? /Hims vs Ro$/ : /Hims vs Ro on Instagram$/,
  );
  await expect(page.getByRole("heading", { name: "Head to head" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formats, side by side" })).toBeVisible();
  const overlap = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Hashtags: who uses what" }) });
  await expect(overlap.getByText("Both", { exact: true })).toBeVisible();
  await expect(page.getByText("Only Hims")).toBeVisible();
  await expect(page.getByText("Only Ro")).toBeVisible();
  await checks(page, mobile, "social-compare-2.png");
});

test("06c compare three brands", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/instagram");
  for (const b of ["Hims", "Ro", "Hers"]) await pill(page, b).click();
  await expect(page.getByText("Shared", { exact: true })).toBeVisible();
  await expect(page.getByText("Only Hers")).toBeVisible();
  await checks(page, mobile, "social-compare-3.png");
});

test("no pull yet", async ({ page }) => {
  await setup(page, []);
  await ready(page, "/instagram");
  await expect(page.getByText("No Instagram posts yet")).toBeVisible();
  await noSidewaysScroll(page);
});

/** Dates ("16 Nov") of the visible posts in a card, in on-screen order. */
async function postDates(card: import("@playwright/test").Locator) {
  const metas = await card
    .locator("article")
    .filter({ visible: true })
    .evaluateAll((els) => els.map((el) => el.querySelector("p")?.textContent ?? ""));
  return metas.map((t) => Date.parse(`${t.split("·").pop()!.trim()} 2026`));
}

test("See all expands top posts in place, sorts, and collapses", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-390";
  await setup(page);
  await ready(page, "/instagram");
  const card = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Top posts on Instagram" }) });
  const toggle = card.getByRole("button", { name: "See all" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(card.getByRole("button", { name: "Show less" }).first()).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(card.getByText("40 posts")).toBeVisible();
  await expect(page).toHaveURL(/[?&]posts=all/);
  await expect(card.locator("article").filter({ visible: true })).toHaveCount(40);

  if (mobile) {
    // Vertical list, not a sideways scroller: each post sits below the previous one.
    const boxes = await card
      .locator("article")
      .filter({ visible: true })
      .evaluateAll((els) => els.slice(0, 3).map((el) => el.getBoundingClientRect().top));
    expect(boxes[1]).toBeGreaterThan(boxes[0]);
    expect(boxes[2]).toBeGreaterThan(boxes[1]);
  }
  await noSidewaysScroll(page);
  if (mobile) await tapTargetsOk(page);
  // Viewport shot of the card's top (the whole expanded card is very tall, with lazy thumbnails).
  await card
    .getByRole("button", { name: "Show less" })
    .first()
    .evaluate((el) => el.scrollIntoView({ block: "start" })); // lands below the sticky app bar
  await expect(page).toHaveScreenshot("social-see-all.png");

  await card.getByRole("radio", { name: "Newest" }).click();
  const dates = await postDates(card);
  expect(dates.length).toBe(40);
  for (let i = 1; i < dates.length; i++) expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);

  // Bottom "Show less" collapses and returns focus to the header button.
  await card.getByRole("button", { name: "Show less" }).last().click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await expect(card.getByText("40 posts")).toHaveCount(0);
  await expect(page).not.toHaveURL(/posts=all/);
});
