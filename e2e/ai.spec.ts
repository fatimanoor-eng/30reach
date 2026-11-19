import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk } from "./helpers";
import { BRANDS, makePosts, NOW } from "./overview-fixtures";

/*
 * Slice 11 AI: Ask Blip (12 / M11), Plan {month} (10), the 09 health-claim check and Suggest hooks.
 * The four Edge Functions are stubbed here: nothing reaches Supabase or Groq.
 */
test.use({ timezoneId: "UTC" });

const us2026: unknown = JSON.parse(
  readFileSync(
    new URL("../supabase/functions/holidays/fixtures/us-2026.json", import.meta.url),
    "utf8",
  ),
);
const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const LATEST = { id: "pull-new", started_at: "2026-11-16T16:20:00Z", status: "done" };
const PREVIOUS = { id: "pull-old", started_at: "2026-11-06T10:00:00Z", status: "done" };
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;
/**
 * Text Blip shows in the thread, in full (a half-revealed line doesn't contain it yet). Scoped to the
 * thread because the screen-reader live region holds a second, hidden copy.
 */
const said = (dialog: Locator, text: string) => dialog.getByTestId("blip-thread").getByText(text);
/** The reveal is over (Stop is back to Send), so Enter sends instead of finishing the reveal. */
const idle = (dialog: Locator) =>
  expect(dialog.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 10_000 }); // LONG ≈ 5 s of words

const ANSWER = {
  type: "insight",
  lead: "Hims is winning with short doctor Q&A videos on TikTok 🎯",
  points: [
    "Format: 5 of Hims’ 6 TikToks are Q&A videos, averaging 9.8K likes vs 3.1K on Instagram.",
    "Timing: their best posts go out Tue evening, the strongest slot in this pull.",
  ],
  forClient: "For OBU Health: a weekly clinician Q&A on TikTok, under 30 seconds.",
  idea: "A weekly clinician Q&A on TikTok, under 30 seconds.",
  inData: true,
  sources: [
    {
      id: "pull-new-p3",
      brand: "Hims",
      platform: "tiktok",
      format: "video",
      postedAt: "2026-11-09T12:00:00Z",
      url: "https://example.com/hims/1",
      likes: 9800,
      views: 212000,
    },
    {
      id: "pull-new-p4",
      brand: "Hims",
      platform: "instagram",
      format: "reel",
      postedAt: "2026-11-09T12:00:00Z",
      url: "https://example.com/hims/2",
      likes: 3400,
      views: null,
    },
  ],
  pull: { id: LATEST.id, startedAt: LATEST.started_at },
};

const PLAN = {
  month: "2027-01",
  ideas: [
    [
      "2027-01-01",
      "instagram",
      "reel",
      "New year, no crash diets",
      "New Year’s Day. Reels are winning right now.",
    ],
    [
      "2027-01-05",
      "tiktok",
      "video",
      "Clinician answers: is Dry January worth it?",
      "Q&A videos are Hims’ best TikTok format this month.",
    ],
    [
      "2027-01-12",
      "instagram",
      "carousel",
      "Week 2 check-in: what’s working",
      "Carousels hold attention mid-month; Tue evening works best.",
    ],
    [
      "2027-01-18",
      "instagram",
      "reel",
      "Small steps, big changes",
      "MLK Day. Keep it about service and community, no promos.",
    ],
    [
      "2027-01-19",
      "tiktok",
      "video",
      "Myth vs fact: metabolism",
      "From your idea board. Fits the Myth vs fact series.",
    ],
    [
      "2027-01-26",
      "instagram",
      "carousel",
      "Your first month, honestly",
      "Inspired by Hers’ “3 things nobody tells you”.",
    ],
  ].map(([date, platform, format, title, reason]) => ({
    date,
    platform,
    format,
    title,
    reason,
    sources: [],
  })),
  facts: { events: 4, bestFormat: "Reels", bestTime: "Tue evening", boardIdeas: 2 },
};

type Fn = (route: Route, body: Record<string, unknown>) => Promise<void> | void;

async function setup(
  page: Page,
  fns: Partial<Record<"ask-blip" | "plan-month" | "check-claims" | "suggest-hooks", Fn>> = {},
) {
  await page.clock.setFixedTime(NOW); // 17 Nov 2026
  await stubSupabase(page);
  await signInAs(page);
  await page.route("**/rest/v1/competitors**", (r) => r.fulfill(json(BRANDS)));
  await page.route("**/rest/v1/pulls**", (r) =>
    r.fulfill(json(r.request().url().includes("status=eq.running") ? null : [LATEST, PREVIOUS])),
  );
  const posts: Record<string, unknown[]> = {
    [LATEST.id]: makePosts(LATEST.id, new Date(LATEST.started_at), { boost: { "c-hims": 1.6 } }),
    [PREVIOUS.id]: makePosts(PREVIOUS.id, new Date(PREVIOUS.started_at), { prefix: "old-" }),
  };
  await page.route("**/rest/v1/posts**", (r) => {
    const id = new URL(r.request().url()).searchParams.get("pull_id")?.replace("eq.", "") ?? "";
    return r.fulfill(json(posts[id] ?? []));
  });

  // Ideas: GET lists, POST is recorded (Add idea to board / Plan {month}).
  const added: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/ideas**", (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      added.push(...(Array.isArray(body) ? body : [body]));
      return r.fulfill({ status: 201, body: "" });
    }
    return r.fulfill(json([]));
  });

  // Calendar: one card (Figma 09) + holidays.
  const cards = [
    {
      id: "k2",
      date: "2026-12-04",
      title: "Holiday eating, no guilt",
      platform: "tiktok",
      format: "video",
      hook: "“You don’t have to skip the party to stay on track.”",
      caption:
        "Three small things our clinicians suggest for holiday dinners: eat before you go, start with protein, and skip the guilt.",
      visual_idea: "Talking head, clinician in kitchen, 3 quick text cards. 25–35 s.",
      status: "drafting",
      origin: "manual",
      idea_id: null,
      updated_at: "2026-11-17T10:00:00Z",
      compliance_status: null,
      compliance_notes: null,
      creator: { full_name: "Fatima Noor" },
    } as Record<string, unknown>,
  ];
  const cardWrites: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/calendar_cards**", (r) => {
    const req = r.request();
    const id = new URL(req.url()).searchParams.get("id")?.replace("eq.", "");
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    if (req.method() === "PATCH") {
      const body = req.postDataJSON();
      cardWrites.push(body);
      Object.assign(
        cards.find((c) => c.id === id)!,
        body,
      );
      return r.fulfill(json(single ? cards.find((c) => c.id === id) : []));
    }
    if (id) return r.fulfill(json(cards.find((c) => c.id === id) ?? null));
    return r.fulfill(json(cards));
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
    return r.fulfill(
      json({
        year,
        data: [
          {
            date: `${year}-01-01`,
            localName: "New Year's Day",
            name: "New Year's Day",
            global: true,
            types: ["Public"],
          },
        ],
        fetchedAt: NOW.toISOString(),
        stale: false,
      }),
    );
  });

  // The AI functions (each test passes what it needs).
  const sent: Record<string, Record<string, unknown>[]> = {};
  for (const name of ["ask-blip", "plan-month", "check-claims", "suggest-hooks"] as const) {
    await page.route(`**/functions/v1/${name}**`, async (r) => {
      const body = r.request().postDataJSON() as Record<string, unknown>;
      (sent[name] ??= []).push(body);
      const fn = fns[name];
      if (fn) return fn(r, body);
      return r.fulfill(json({ error: "ai_unavailable" }, 502));
    });
  }
  return { added, sent, cardWrites };
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function openAskBlip(page: Page) {
  if (isPhone(page)) await page.locator("button.fixed[aria-label='Ask Blip']").click();
  else await page.getByRole("button", { name: "Ask Blip" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Ask Blip" });
  await expect(dialog).toBeVisible();
  return dialog;
}

// ───────────────────────────── Ask Blip (12 / M11)

test("Ask Blip — answers from the pull, cites posts, adds the idea (12 / M11)", async ({
  page,
}, info) => {
  let release!: () => void;
  const answered = new Promise<void>((resolve) => (release = resolve));
  const { added, sent } = await setup(page, {
    "ask-blip": async (r) => {
      await answered; // hold the answer so the typing dots can be checked
      await r.fulfill(json(ANSWER));
    },
  });
  await open(page, "/overview");
  const dialog = await openAskBlip(page);

  // Greeting written by code (no request), the pull it reads, and the chips.
  await expect(
    dialog.getByText(/Hey Fatima! 👋 I’ve read the 16 Nov pull, \d+ posts from 6 brands/),
  ).toBeVisible();
  await expect(dialog.getByText(/pull from 16 NOV/i).filter({ visible: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "What changed since the last pull?" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Give me 3 post ideas for OBU" })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Ask Blip a question" })).toBeFocused();

  await dialog
    .getByRole("textbox", { name: "Ask Blip a question" })
    .fill("Why is Hims doing better on TikTok?");
  await page.keyboard.press("Enter");
  await expect(dialog.getByTestId("blip-typing")).toBeVisible();
  if (isPhone(page)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`ask-blip-typing-${info.project.name}.png`);
  release();
  await expect(said(dialog, ANSWER.lead)).toBeVisible();
  expect(sent["ask-blip"][0]).toMatchObject({
    clientId: "client-1",
    question: "Why is Hims doing better on TikTok?",
    history: [],
  });

  await expect(dialog.getByText("Based on 2 posts")).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: /Hims · TikTok · 9 Nov · 212K views/ }),
  ).toHaveAttribute("href", "https://example.com/hims/1");
  await expect(
    dialog.getByRole("link", { name: /Hims · Instagram · 9 Nov · 3.4K likes/ }),
  ).toBeVisible();

  if (isPhone(page)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`ask-blip-${info.project.name}.png`);

  // Add idea to board → an AI idea with no creator (only admins can delete it).
  await dialog.getByRole("button", { name: "Add idea to board" }).click();
  await expect(dialog.getByText("Saved to idea board ·")).toBeVisible();
  expect(added[0]).toMatchObject({
    kind: "ai",
    note: ANSWER.idea,
    created_by: null,
    platform: "tiktok",
    source_post_id: "pull-new-p3",
  });

  // A follow-up sends the earlier turn as history; closing and reopening keeps the thread.
  await idle(dialog);
  await dialog.getByRole("button", { name: "Give me 3 post ideas for OBU" }).click();
  await expect.poll(() => sent["ask-blip"].length).toBe(2);
  expect((sent["ask-blip"][1].history as unknown[]).length).toBe(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await openAskBlip(page);
  await expect(dialog.getByText("Why is Hims doing better on TikTok?")).toBeVisible();
});

test("Ask Blip — chat replies: small talk from Groq, bare hi / thanks answered in code", async ({
  page,
}, info) => {
  const CHAT = {
    type: "chat",
    message: "LETS GOOO 🚀 Hims just had a big week, want the top post?",
  };
  const { sent } = await setup(page, { "ask-blip": (r) => r.fulfill(json(CHAT)) });
  await open(page, "/overview");
  const dialog = await openAskBlip(page);
  const box = dialog.getByRole("textbox", { name: "Ask Blip a question" });

  // A bare greeting / thanks never reaches the function, and the lines rotate.
  await box.fill("Hey! 👋");
  await page.keyboard.press("Enter");
  await expect(
    said(
      dialog,
      "Hey Fatima! 👋 Ready when you are. Want to see what changed since the last pull?",
    ),
  ).toBeVisible();
  await idle(dialog);
  await box.fill("hiiii!!");
  await page.keyboard.press("Enter");
  await expect(
    said(dialog, "Hiiii Fatima! 🙌 Let’s find something good. Who should we look at first?"),
  ).toBeVisible();

  // Hype goes to Groq; the chat reply has no sources and nothing to add to the board.
  await idle(dialog);
  await box.fill("lets gooo");
  await page.keyboard.press("Enter");
  await expect(said(dialog, CHAT.message)).toBeVisible();
  expect(sent["ask-blip"]).toHaveLength(1);
  expect(sent["ask-blip"][0]).toMatchObject({ question: "lets gooo", history: [] });
  await expect(dialog.getByText(/Based on \d+ post/)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Add idea to board" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Copy" })).toHaveCount(0); // insights only

  await idle(dialog);
  await box.fill("thank you!");
  await page.keyboard.press("Enter");
  await expect(
    said(dialog, "Anytime, Fatima! 🙌 Shout if you want to dig into anything else."),
  ).toBeVisible();
  expect(sent["ask-blip"]).toHaveLength(1);

  // Code-written replies aren't sent back as history; Groq's chat reply is.
  await idle(dialog);
  await dialog.getByRole("button", { name: "What changed since the last pull?" }).click();
  await expect.poll(() => sent["ask-blip"].length).toBe(2);
  expect(sent["ask-blip"][1].history).toEqual([{ q: "lets gooo", a: CHAT.message }]);
  await expect(said(dialog, CHAT.message)).toHaveCount(2);

  await idle(dialog);
  if (isPhone(page)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`ask-blip-chat-${info.project.name}.png`);
});

// ───────────────────────────── Ask Blip chat feel: typing dots, reveal, Stop, scroll, a11y

const LONG = {
  ...ANSWER,
  points: Array.from(
    { length: 8 },
    (_, i) =>
      `Point ${i + 1}: Hims posts short clinician Q&A videos on TikTok most weeks, and they keep pulling far more likes than anything else in this pull.`,
  ),
};

test("Ask Blip — typing dots, then a word-by-word reveal; Stop, a key or a tap finishes it", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await setup(page, {
    "ask-blip": async (r) => {
      await held;
      await r.fulfill(json(LONG));
    },
  });
  await open(page, "/overview");
  const dialog = await openAskBlip(page);
  const box = dialog.getByRole("textbox", { name: "Ask Blip a question" });
  const live = dialog.locator('[aria-live="polite"]');

  // Code reply: dots for 400–700 ms, then the reveal.
  await box.fill("hey!");
  await page.keyboard.press("Enter");
  await expect(dialog.getByTestId("blip-typing")).toBeVisible();
  await expect(live).toHaveText("Blip is typing…");
  await expect(dialog.getByTestId("blip-typing")).toHaveCount(0);
  const hey = "Hey Fatima! 👋 Ready when you are. Want to see what changed since the last pull?";
  await expect(live).toHaveText(hey); // announced once, in full, while the words appear
  // Stop finishes the reveal at once and turns back into Send.
  const stop = dialog.getByRole("button", { name: "Stop" });
  if (await stop.isVisible()) await stop.click();
  await expect(said(dialog, hey)).toBeVisible();
  await idle(dialog);

  // Insight: dots until the answer arrives; sources and actions only after the reveal.
  await box.fill("Why is Hims doing better on TikTok?");
  await page.keyboard.press("Enter");
  await expect(dialog.getByTestId("blip-typing")).toBeVisible();
  release();
  await expect(stop).toBeVisible(); // ~4 s of words at 40 words/s
  await expect(dialog.getByText("Based on 2 posts")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Add idea to board" })).toHaveCount(0);
  await expect(live).toContainText(LONG.points[7]);
  await page.keyboard.press("Shift"); // any key
  await expect(said(dialog, LONG.points[7])).toBeVisible();
  await expect(dialog.getByText("Based on 2 posts")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add idea to board" })).toBeVisible();
  await idle(dialog);

  // A tap on the message finishes it too.
  await dialog.getByRole("button", { name: "What changed since the last pull?" }).click();
  await expect(stop).toBeVisible();
  await dialog.getByTestId("blip-thread").locator("p").filter({ hasText: /^Hims/ }).last().click();
  await idle(dialog);
  await expect(said(dialog, LONG.points[7])).toHaveCount(2);
});

test("Ask Blip — follows the reveal, but not after scrolling up", async ({ page }) => {
  await setup(page, { "ask-blip": (r) => r.fulfill(json(LONG)) });
  await open(page, "/overview");
  const dialog = await openAskBlip(page);
  const thread = dialog.getByTestId("blip-thread");
  const atBottom = () =>
    thread.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 48);

  await dialog.getByRole("button", { name: "What changed since the last pull?" }).click();
  await idle(dialog);
  await expect.poll(atBottom).toBe(true);

  await dialog.getByRole("button", { name: "Give me 3 post ideas for OBU" }).click();
  await expect(dialog.getByRole("button", { name: "Stop" })).toBeVisible();
  await thread.evaluate((el) => el.scrollTo({ top: 0 }));
  await idle(dialog);
  expect(await thread.evaluate((el) => el.scrollTop)).toBeLessThan(50); // stayed where they were
});

test("Ask Blip — reduced motion: no reveal, the whole answer at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page, { "ask-blip": (r) => r.fulfill(json(LONG)) });
  await open(page, "/overview");
  const dialog = await openAskBlip(page);
  await dialog.getByRole("button", { name: "What changed since the last pull?" }).click();
  await expect(said(dialog, LONG.points[7])).toBeVisible();
  await expect(dialog.getByText("Based on 2 posts")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Stop" })).toHaveCount(0);
  expect(
    await dialog
      .locator(".blip-dot")
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName)),
  ).toEqual([]); // dots are gone by now; their animation is off under reduced motion anyway
});

test("Ask Blip — rate limit: catches its breath, retries once, then the breather line", async ({
  page,
}) => {
  let calls = 0;
  const { sent } = await setup(page, {
    "ask-blip": (r) =>
      ++calls <= 2
        ? r.fulfill(json({ error: "rate_limited", retryAfter: 1 }, 429))
        : r.fulfill(json({ error: "ai_unavailable" }, 502)),
  });
  await open(page, "/overview");
  const dialog = await openAskBlip(page);
  await dialog.getByRole("button", { name: "What changed since the last pull?" }).click();
  await expect(said(dialog, "One sec, catching my breath…")).toBeVisible();
  await expect(
    dialog.getByText("I need a quick breather. Groq asked me to slow down. Try again in a minute."),
  ).toBeVisible();
  expect(sent["ask-blip"]).toHaveLength(2); // one automatic retry, no more
  await dialog.getByRole("button", { name: "What changed since the last pull?" }).click();
  await expect(
    dialog.getByText("Something went wrong on my side. Nothing’s lost, want to try again?"),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(sent["ask-blip"]).toHaveLength(3); // other errors aren't retried automatically
});

test("Ask Blip — a rate limit that clears answers after the retry", async ({ page }) => {
  let calls = 0;
  await setup(page, {
    "ask-blip": (r) =>
      ++calls === 1
        ? r.fulfill(json({ error: "rate_limited", retryAfter: 1 }, 429))
        : r.fulfill(json(ANSWER)),
  });
  await open(page, "/overview");
  const dialog = await openAskBlip(page);
  await dialog.getByRole("button", { name: "What changed since the last pull?" }).click();
  await expect(said(dialog, "One sec, catching my breath…")).toBeVisible();
  await expect(said(dialog, ANSWER.lead)).toBeVisible();
  await expect(said(dialog, "One sec, catching my breath…")).toHaveCount(0);
  await expect(dialog.getByText(/quick breather/)).toHaveCount(0);
});

test("Ask Blip — short small talk goes light (no data), data questions don't", async ({ page }) => {
  const CHAT = { type: "chat", message: "hehe 😄 that got me. Want to see what changed?" };
  const { sent } = await setup(page, {
    "ask-blip": (r) =>
      r.fulfill(json((r.request().postDataJSON() as { light?: boolean }).light ? CHAT : ANSWER)),
  });
  await open(page, "/overview");
  const dialog = await openAskBlip(page);
  const box = dialog.getByRole("textbox", { name: "Ask Blip a question" });
  await box.fill("hehehe");
  await page.keyboard.press("Enter");
  await expect(said(dialog, CHAT.message)).toBeVisible();
  expect(sent["ask-blip"][0]).toMatchObject({ question: "hehehe", light: true });

  await idle(dialog);
  await box.fill("how is Hims doing?");
  await page.keyboard.press("Enter");
  await expect(said(dialog, ANSWER.lead)).toBeVisible();
  expect(sent["ask-blip"][1].light).toBeUndefined();
  expect(sent["ask-blip"][1].history).toEqual([{ q: "hehehe", a: CHAT.message }]);
});

test("Ask Blip — “Ask Blip what changed” (05e) opens it with that question", async ({ page }) => {
  const { sent } = await setup(page, { "ask-blip": (r) => r.fulfill(json(ANSWER)) });
  await open(page, "/overview");
  await page.getByRole("button", { name: "Ask Blip what changed" }).click();
  const dialog = page.getByRole("dialog", { name: "Ask Blip" });
  await expect(said(dialog, ANSWER.lead)).toBeVisible();
  expect(sent["ask-blip"]).toHaveLength(1);
  expect(sent["ask-blip"][0].question).toBe("What changed since the last pull?");
});

// ───────────────────────────── Plan {month} (10)

test("Plan January — suggestions go to the idea board, never the calendar (10)", async ({
  page,
}, info) => {
  const { added, sent, cardWrites } = await setup(page, {
    "plan-month": (r) => r.fulfill(json(PLAN)),
  });
  await open(page, "/calendar?date=2026-12-24");
  await page.getByRole("button", { name: "Plan January" }).click();
  const dialog = page.getByRole("dialog", { name: "Plan January" });
  await expect(dialog.getByRole("heading", { name: "6 ideas for January 2027" })).toBeVisible();
  await expect(dialog.getByText("4 events in January")).toBeVisible();
  await expect(dialog.getByText("Reels win right now")).toBeVisible();

  // Events come from code rules + Nager: New Year's Day (holiday), Resolution season (code rule).
  const events = sent["plan-month"][0].events as { date: string; name: string; kind: string }[];
  expect(sent["plan-month"][0].month).toBe("2027-01");
  expect(events).toContainEqual({ date: "2027-01-01", name: "New Year's Day", kind: "holiday" });
  expect(events.every((e) => e.date.startsWith("2027-01-"))).toBe(true);

  if (isPhone(page)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`plan-month-${info.project.name}.png`);

  // Untick two (Figma shows 4 of 6) → "Add 4 to idea board".
  await dialog.getByText("Small steps, big changes").click();
  await dialog.getByText("Your first month, honestly").click();
  await expect(
    dialog.getByRole("checkbox", { name: /Your first month, honestly/ }),
  ).not.toBeChecked();
  await dialog.getByRole("button", { name: "Add 4 to idea board" }).click();
  await expect(page.getByText("Added 4 ideas to the idea board")).toBeVisible();
  expect(added).toHaveLength(4);
  expect(added[1]).toMatchObject({
    kind: "ai",
    created_by: null,
    note: "Clinician answers: is Dry January worth it?\nWhy: Q&A videos are Hims’ best TikTok format this month.",
    platform: "tiktok",
    format: "video",
    source_snapshot: { saved_from: "plan", suggested_date: "2027-01-05" },
  });
  expect(cardWrites).toEqual([]); // nothing went onto the calendar
});

test("Plan {month} — only up to 3 months ahead", async ({ page }) => {
  await setup(page);
  await open(page, "/calendar?date=2027-02-10");
  const button = page.getByRole("button", { name: "Plan March" });
  await expect(button).toHaveAttribute("aria-disabled", "true");
});

test("Plan {month} — rate limited", async ({ page }) => {
  await setup(page, {
    "plan-month": (r) => r.fulfill(json({ error: "rate_limited", retryAfter: 60 }, 429)),
  });
  await open(page, "/calendar?date=2026-12-24");
  await page.getByRole("button", { name: "Plan January" }).click();
  const dialog = page.getByRole("dialog", { name: "Plan January" });
  await expect(
    dialog.getByText("I need a quick breather. Groq asked me to slow down."),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add to idea board" })).toBeDisabled();
});

// ───────────────────────────── 09 health check + Suggest hooks

test("card — Save saves first, then shows the health check (09)", async ({ page }, info) => {
  const { cardWrites, sent } = await setup(page, {
    "check-claims": (r) =>
      r.fulfill(
        json({
          status: "flagged",
          issues: [{ quote: "Lose 10 lbs", why: "Promises weight loss." }],
          hash: "abc",
          checkedAt: NOW.toISOString(),
        }),
      ),
  });
  await open(page, "/calendar?date=2026-12-04&card=k2");
  const dialog = page.getByRole("dialog", { name: /Holiday eating/ });
  await dialog.getByRole("textbox", { name: "Hook" }).fill("Lose 10 lbs before the holidays");
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(dialog.getByText("1 phrase to look at before filming:")).toBeVisible();
  await expect(dialog.getByText("Advisory only. Saving is never blocked.")).toBeVisible();
  expect(cardWrites[0]).toMatchObject({ hook: "Lose 10 lbs before the holidays" }); // saved first
  expect(sent["check-claims"][0]).toMatchObject({
    cardId: "k2",
    hook: "Lose 10 lbs before the holidays",
  });
  await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  await noSidewaysScroll(page);
  await expect(dialog).toHaveScreenshot(`health-check-flagged-${info.project.name}.png`);

  // Editing the text hides the old result and turns the button back into Save.
  await dialog.getByRole("textbox", { name: "Hook" }).fill("Small swaps, no guilt");
  await expect(dialog.getByText("1 phrase to look at before filming:")).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeVisible();
});

test("card — clear check, and a failed check never blocks saving", async ({ page }) => {
  let calls = 0;
  const { cardWrites } = await setup(page, {
    "check-claims": (r) =>
      ++calls === 1
        ? r.fulfill(json({ error: "rate_limited", retryAfter: 30 }, 429))
        : r.fulfill(json({ status: "clear", issues: [], hash: "x", checkedAt: NOW.toISOString() })),
  });
  await open(page, "/calendar?date=2026-12-04&card=k2");
  const dialog = page.getByRole("dialog", { name: /Holiday eating/ });
  await dialog
    .getByRole("textbox", { name: "Caption" })
    .fill("Eat before you go. Start with protein.");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Couldn’t check this time. The card is saved.")).toBeVisible();
  expect(cardWrites).toHaveLength(1);
  await dialog.getByRole("button", { name: "Check again" }).click();
  await expect(
    dialog.getByText("No health claims found. Supportive tone, no food guilt."),
  ).toBeVisible();
  // Status-only change: saves and closes without another check.
  await dialog.getByRole("radio", { name: "Approved" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  expect(calls).toBe(2);
});

test("card — Suggest hooks puts the picked hook in the field", async ({ page }, info) => {
  const { sent } = await setup(page, {
    "suggest-hooks": (r) =>
      r.fulfill(
        json({
          hooks: [
            "What does a clinician eat before a holiday party?",
            "One meal doesn’t undo your progress.",
            "You don’t have to skip the party to stay on track.",
          ],
        }),
      ),
  });
  await open(page, "/calendar?date=2026-12-04&card=k2");
  const dialog = page.getByRole("dialog", { name: /Holiday eating/ });
  await dialog.getByRole("button", { name: "Suggest hooks" }).click();
  await expect(dialog.getByText("Pick a hook")).toBeVisible();
  expect(sent["suggest-hooks"][0]).toMatchObject({
    clientId: "client-1",
    title: "Holiday eating, no guilt",
    platform: "tiktok",
    format: "video",
  });
  if (isPhone(page)) await tapTargetsOk(page);
  await expect(dialog).toHaveScreenshot(`suggest-hooks-${info.project.name}.png`);
  await dialog.getByRole("button", { name: "One meal doesn’t undo your progress." }).click();
  await expect(dialog.getByRole("textbox", { name: "Hook" })).toHaveValue(
    "One meal doesn’t undo your progress.",
  );
  await expect(dialog.getByText("Pick a hook")).toBeHidden();
});
