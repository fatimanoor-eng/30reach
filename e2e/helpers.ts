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
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page scrolls sideways").toBe(0);
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
  await page.route("**/rest/v1/pulls**", (route) => route.fulfill(ok(null)));
  await page.route("**/rest/v1/pull_tasks**", (route) => route.fulfill(ok([])));
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
