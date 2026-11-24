import { expect, type Page } from "@playwright/test";

/*
 * Shared Playwright helpers. Nothing here talks to the real Supabase project:
 * stubSupabase() answers auth + profile requests locally, signInAs() plants a fake session
 * in localStorage (key "30reach-auth", see src/lib/supabase.ts) before the app loads.
 */

/** App pages live under the client (Slice 17b): "/calendar?date=…" → "/c/obu-health/calendar?date=…".
 *  Going there directly skips the last-client redirect (covered in clients.spec.ts). Other paths
 *  (sign-in, welcome, /c/…) are left as they are. */
export function appUrl(path: string, slug = "obu-health"): string {
  return /^\/(overview|instagram|tiktok|linkedin|facebook|competitors|calendar|ideas|settings|client-settings|usage|more|dev)\b/.test(
    path,
  )
    ? `/c/${slug}${path}`
    : path;
}

export async function ready(page: Page, path: string) {
  await page.goto(appUrl(path));
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
  await stubClients(page, [OBU]);
  // OBU's platforms (Slice 17b: client_platforms decides what's tracked; 17c shows them in settings).
  await page.route("**/rest/v1/client_platforms**", (route) =>
    route.request().method() === "GET"
      ? route.fulfill(ok(OBU_PLATFORMS))
      : route.fulfill({ status: 201, body: "" }),
  );
  await page.route("**/rest/v1/rpc/set_last_client", (route) =>
    route.fulfill({ status: 204, body: "" }),
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
  // No posts unless a spec serves them: never let a dashboard query reach the real project (it answered
  // 401 at an unpredictable speed and delayed "Pull complete" past its timeout).
  await page.route("**/rest/v1/posts**", (route) => route.fulfill(ok([])));
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

export type TestClient = {
  id: string;
  slug: string;
  name: string;
  initials: string | null;
  brand_color: string | null;
  is_demo: boolean;
  archived_at: string | null;
  /** Slice 17c (Client settings) — optional in specs, filled in by stubClients. */
  archived_by?: string | null;
  logo_path?: string | null;
  website?: string | null;
  description?: string | null;
  industry?: string | null;
  audience?: string | null;
  country?: string;
  language?: string;
  regulated?: string[];
  audience_is_kids?: boolean;
  health_months?: boolean;
  content_rules?: unknown[];
};
export const OBU: TestClient = {
  id: "client-1",
  slug: "obu-health",
  name: "OBU Health",
  initials: "OB",
  brand_color: null,
  is_demo: false,
  archived_at: null,
  website: "https://www.obuhealth.com",
  description:
    "Prescription weight loss, GLP-1, NAD+ and peptide treatments online, with US board-certified doctors.",
  industry: "Telehealth · weight loss and wellness",
  regulated: ["health", "medical claims", "weight loss", "pharma"],
  health_months: true,
  content_rules: [
    {
      id: "obu-1",
      source: "blip",
      rule: "No before / after photos or guaranteed weight loss",
      why: "Weight-loss results must be typical and backed up.",
      quote: "Clinically backed GLP-1 for appetite control and sustainable weight loss.",
    },
    {
      id: "obu-2",
      source: "blip",
      rule: "Don’t imply treatment without a doctor’s review",
      why: "Prescriptions follow a licensed provider’s assessment.",
      quote: "US board-certified doctors",
    },
  ],
};

const DETAIL_DEFAULTS = {
  archived_by: null,
  logo_path: null,
  website: null,
  description: null,
  industry: null,
  audience: null,
  country: "US",
  language: "en",
  regulated: [],
  audience_is_kids: false,
  health_months: false,
  content_rules: [],
};

/** OBU's platforms as the 17a migration left them (website links always on; LinkedIn / Facebook team). */
export const OBU_PLATFORMS = [
  ["instagram", "website", "obuhealth"],
  ["tiktok", "website", "obuhealth"],
  ["linkedin", "team", null],
  ["facebook", "team", null],
  ["x", "website", "obuhealth"],
  ["pinterest", "website", null],
  ["youtube", "website", "obuhealth"],
].map(([platform, source, handle]) => ({
  platform,
  state: "on",
  source,
  account_handle: handle,
  account_url: platform === "pinterest" ? "https://www.pinterest.com/obuhealth" : null,
}));

/**
 * The clients table (Slice 17b): the list for the switcher / redirects, or one client by `slug=eq.…` /
 * `id=eq.…` (unknown → empty). `.single()` reads (Accept: vnd.pgrst.object) get the object itself.
 * Writes (PATCH / POST) answer 204 / the row; specs that check them register their own route. The last
 * registered route wins, so specs can call it again with more clients.
 */
export async function stubClients(page: Page, clients: TestClient[]) {
  const full = clients.map((c) => ({ ...DETAIL_DEFAULTS, ...c }));
  await page.route("**/rest/v1/clients**", (route) => {
    const req = route.request();
    if (req.method() !== "GET" && req.method() !== "HEAD") {
      return route.fulfill({ status: 204, body: "" });
    }
    const params = new URL(req.url()).searchParams;
    const slug = params.get("slug");
    const id = params.get("id");
    const list = full.filter(
      (c) => (!slug || `eq.${c.slug}` === slug) && (!id || `eq.${c.id}` === id),
    );
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    if (single && list.length !== 1) {
      return route.fulfill({
        status: 406,
        contentType: "application/json",
        body: JSON.stringify({ code: "PGRST116", message: "not one row" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(single ? list[0] : list),
    });
  });
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
