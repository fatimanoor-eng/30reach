import { expect, type Page } from "@playwright/test";

/*
 * Shared Playwright helpers. Nothing here talks to the real Supabase project:
 * stubSupabase() answers auth + profile requests locally, signInAs() plants a fake session
 * in localStorage (key "30reach-auth", see src/lib/supabase.ts) before the app loads.
 */

export async function ready(page: Page, path: string) {
  await page.goto(path);
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

export async function noSidewaysScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll - client, "page scrolls sideways").toBe(0);
  // On phones an over-wide element widens the whole layout (scroll = client = 457 px on a 390 px
  // screen), which the first check can't see: compare with the screen width too.
  const screen = page.viewportSize()?.width;
  if (screen)
    expect(scroll, `page is wider than the ${screen} px screen`).toBeLessThanOrEqual(screen);
}

/** Every visible interactive element on mobile must be at least 44 × 44 px. */
export async function tapTargetsOk(page: Page) {
  const small = await page.evaluate(() => {
    const els = document.querySelectorAll<HTMLElement>(
      'a[href], button, [role="radio"], [tabindex="0"]',
    );
    return [...els]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        // Ignore visually hidden elements (e.g. the skip link until it's focused).
        const srOnly = s.clipPath !== "none" || s.clip.startsWith("rect");
        const visible = r.width > 1 && r.height > 1 && s.visibility !== "hidden" && !srOnly;
        return visible && (r.width < 44 || r.height < 44);
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`;
      });
  });
  expect(small, "tap targets smaller than 44 px").toEqual([]);
}

export async function stubSupabase(
  page: Page,
  profile: { role: "admin" | "member"; full_name: string } = {
    role: "admin",
    full_name: "Fatima Noor",
  },
) {
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  // Credits Edge Function: fixed reading so screenshots don't depend on the real balance.
  await page.route("**/functions/v1/credits**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        remaining: 588,
        plan: 1000,
        periodStart: "2026-11-01T00:00:00Z",
        resetsAt: "2026-12-01T12:00:00Z",
        updatedAt: "2026-11-17T14:02:00Z",
        stale: false,
      }),
    }),
  );
  // Client + "no running pull" by default (tests can override: the last registered route wins).
  const ok = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/rest/v1/clients**", (route) =>
    route.fulfill(ok({ id: "client-1", name: "OBU Health" })),
  );
  // Access check on app open (is_team() also checks the "removed" flag, Slice 12).
  await page.route("**/rest/v1/rpc/is_team", (route) => route.fulfill(ok(true)));
  // Settings (Slice 12) defaults: just the signed-in person, fixed sizes, no Groq reading yet.
  // settings.spec.ts registers its own (the last registered route wins).
  await page.route("**/rest/v1/rpc/team_members", (route) =>
    route.fulfill(
      ok([
        {
          id: "00000000-0000-4000-8000-000000000001",
          email: "fatima.noor@breakthirty.com",
          full_name: profile.full_name,
          role: profile.role,
          disabled_at: null,
          last_sign_in_at: null, // "Signed in …" depends on today; settings.spec.ts fixes the clock
          created_at: "2026-11-01T00:00:00Z",
        },
      ]),
    ),
  );
  await page.route("**/rest/v1/rpc/usage_sizes", (route) =>
    route.fulfill(ok({ database_bytes: 42 * 1024 * 1024, storage_bytes: { "post-thumbs": 0 } })),
  );
  await page.route("**/rest/v1/usage_meters**", (route) => route.fulfill(ok(null)));
  // Idea count for "Delete all ideas" (HEAD …?count=exact): an empty board unless a spec says
  // otherwise. Content-Range has to be exposed for the browser to read it cross-origin.
  await page.route("**/rest/v1/ideas**", (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({
          status: 200,
          headers: {
            "content-range": "*/0",
            "access-control-expose-headers": "Content-Range",
            "access-control-allow-origin": "*",
          },
          body: "",
        })
      : route.fallback(),
  );
  await page.route("**/rest/v1/pulls**", (route) => route.fulfill(ok(null)));
  await page.route("**/rest/v1/competitors**", (route) =>
    route.fulfill(
      ok(
        [
          ["c-found", "Found", "Fo"],
          ["c-hers", "Hers", "He"],
          ["c-hims", "Hims", "Hi"],
          ["c-lifemd", "LifeMD", "LM"],
          ["c-ro", "Ro", "Ro"],
          ["c-ww", "WeightWatchers", "WW"],
        ].map(([id, name, initials]) => ({
          id,
          name,
          initials,
          // Accounts decide which platforms the switch / sidebar show (Slice 16b): IG, TikTok, LinkedIn.
          instagram_handle: id.replace("c-", ""),
          tiktok_handle: id.replace("c-", ""),
          linkedin_url: id === "c-hims" ? "https://www.linkedin.com/company/hims-&-hers/" : null,
          facebook_url: null,
        })),
      ),
    ),
  );
  await page.route("**/rest/v1/pull_tasks**", (route) => route.fulfill(ok([])));
  // No saved ideas by default (ideas.spec.ts has its own table).
  await page.route("**/rest/v1/ideas**", (route) => route.fulfill(ok([])));
  await page.route("**/rest/v1/profiles**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([profile]),
    }),
  );
}

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** Plant a (fake, unsigned) Supabase session so the app starts signed in. */
export async function signInAs(
  page: Page,
  {
    email = "fatima.noor@breakthirty.com",
    name = "Fatima Noor",
    fresh = false,
  }: { email?: string; name?: string; fresh?: boolean } = {},
) {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: { provider: "google" },
    user_metadata: { full_name: name, name },
    created_at: "2026-11-17T00:00:00Z",
  };
  const accessToken = [
    b64url({ alg: "HS256", typ: "JWT" }),
    b64url({ sub: user.id, email, role: "authenticated", aud: "authenticated", exp }),
    "test",
  ].join(".");
  const session = {
    access_token: accessToken,
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 24 * 3600,
    expires_at: exp,
    user,
  };
  await page.addInitScript(
    ([value, isFresh]) => {
      localStorage.setItem("30reach-auth", value as string);
      if (isFresh) sessionStorage.setItem("30reach:fresh-sign-in", "1");
    },
    [JSON.stringify(session), fresh] as const,
  );
}

/**
 * Switch platform the way each size does it (Slice 16b): phones open the "Platform" chip's bottom sheet
 * and tap a row; tablet / desktop click the segmented switch (icon-only on tablet, named by aria-label).
 */
export async function pickPlatform(page: Page, name: string, mobile: boolean) {
  if (mobile) {
    await page
      .getByRole("button", { name: /^Platform: / })
      .filter({ visible: true })
      .click();
    const sheet = page.getByRole("dialog", { name: "Platform" });
    await sheet.getByRole("button", { name, exact: true }).click();
    await expect(sheet).toBeHidden();
  } else {
    await page.getByRole("radio", { name, exact: true }).filter({ visible: true }).click();
  }
}

/** The platform the page's switch shows as current, at any size. */
export function currentPlatform(page: Page, name: string, mobile: boolean) {
  return mobile
    ? page.getByRole("button", { name: `Platform: ${name}. Change platform` })
    : page.getByRole("radio", { name, exact: true, checked: true }).filter({ visible: true });
}
