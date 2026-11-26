import { expect, test, type Locator, type Page } from "@playwright/test";
import { OBU, ready, signInAs, stubClients, stubSupabase, type TestClient } from "./helpers";
import { COMPETITORS, makePosts, NOW } from "./overview-fixtures";

/*
 * Ask Blip and the AI features use only the current client's data, and switching clients (in the app,
 * no reload) starts a fresh Blip conversation. The server side (what the AI functions read for a
 * clientId) is unit-tested in supabase/functions/_shared/ai-server.test.ts.
 */
test.use({ timezoneId: "UTC" });

const BEST: TestClient = {
  id: "client-2",
  slug: "all-the-best-co",
  name: "All The Best Co",
  initials: "AB",
  brand_color: "#D2473A",
  is_demo: false,
  archived_at: null,
};
const PULLS: Record<string, { id: string; started_at: string; status: string }> = {
  [OBU.id]: { id: "pull-obu", started_at: "2026-11-16T16:20:00Z", status: "done" },
  [BEST.id]: { id: "pull-atb", started_at: "2026-11-15T10:00:00Z", status: "done" },
};
const VINE = { ...COMPETITORS[0], id: "c-vine", name: "Carnaby & Vine" };
const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const clientOf = (url: string) => new URL(url).searchParams.get("client_id")?.replace("eq.", "");

async function setup(page: Page) {
  await page.clock.setFixedTime(NOW);
  await stubSupabase(page);
  await stubClients(page, [OBU, BEST]);
  await signInAs(page);
  // Each client's own brands, pulls and posts.
  const competitorReads: (string | undefined)[] = [];
  await page.route("**/rest/v1/competitors**", (r) => {
    const client = clientOf(r.request().url());
    competitorReads.push(client);
    return r.fulfill(json(client === BEST.id ? [VINE] : COMPETITORS));
  });
  await page.route("**/rest/v1/pulls**", (r) => {
    const url = new URL(r.request().url());
    if (url.searchParams.get("status") === "eq.running") return r.fulfill(json(null));
    if (url.searchParams.get("select") === "client_id,started_at") {
      return r.fulfill(json(Object.entries(PULLS).map(([client_id, p]) => ({ client_id, ...p }))));
    }
    const pull = PULLS[clientOf(r.request().url()) ?? ""];
    return r.fulfill(json(pull ? [pull] : []));
  });
  await page.route("**/rest/v1/posts**", (r) => {
    const id = new URL(r.request().url()).searchParams.get("pull_id")?.replace("eq.", "");
    const pull = Object.values(PULLS).find((p) => p.id === id);
    const posts = pull ? makePosts(pull.id, new Date(pull.started_at)) : [];
    // All The Best Co's pull has only Carnaby & Vine's posts.
    return r.fulfill(
      json(
        id === PULLS[BEST.id].id
          ? posts.slice(0, 4).map((p) => ({ ...p, competitor_id: VINE.id }))
          : posts,
      ),
    );
  });
  // Ask Blip answers with the client it was asked about, so a mix-up would show in the thread.
  const sent: { clientId: string; question: string; history: unknown[] }[] = [];
  await page.route("**/functions/v1/ask-blip**", (r) => {
    const body = r.request().postDataJSON() as (typeof sent)[number];
    sent.push(body);
    const name = body.clientId === BEST.id ? BEST.name : OBU.name;
    return r.fulfill(json({ type: "chat", message: `Here’s what I see for ${name}.` }));
  });
  return { sent, competitorReads };
}

async function openAskBlip(page: Page) {
  await page.getByRole("button", { name: "Ask Blip" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Ask Blip" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function ask(dialog: Locator, question: string) {
  await dialog.getByRole("textbox", { name: "Ask Blip a question" }).fill(question);
  await dialog.page().keyboard.press("Enter");
}

async function switchTo(page: Page, name: string, slug: string) {
  await page.getByRole("button", { name: /^Client: .*Switch client$/ }).click();
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${slug}/overview`));
}

test("Ask Blip uses the current client only; switching clients starts a fresh conversation", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-1440",
    "same logic at every size; switcher tested in clients.spec",
  );
  const { sent, competitorReads } = await setup(page);
  await ready(page, "/c/obu-health/overview");

  // OBU: the question goes out with OBU's id and no history.
  let dialog = await openAskBlip(page);
  await expect(dialog.getByRole("button", { name: "Give me 3 post ideas for OBU" })).toBeVisible();
  await ask(dialog, "Who posts the most?");
  await expect(dialog.getByText("Here’s what I see for OBU Health.").first()).toBeVisible();
  expect(sent[0]).toMatchObject({ clientId: OBU.id, question: "Who posts the most?", history: [] });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Switch in the app (the shell, and Blip's thread hook, stay mounted).
  await switchTo(page, BEST.name, BEST.slug);
  dialog = await openAskBlip(page);
  // A fresh conversation: OBU's turn is gone; the chips name the new client.
  await expect(dialog.getByText("Who posts the most?")).toHaveCount(0);
  await expect(dialog.getByText("Here’s what I see for OBU Health.")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Give me 3 post ideas for All The Best" }),
  ).toBeVisible();
  await ask(dialog, "What should we post this week?");
  await expect(dialog.getByText("Here’s what I see for All The Best Co.").first()).toBeVisible();
  expect(sent[1]).toMatchObject({
    clientId: BEST.id,
    question: "What should we post this week?",
    history: [], // nothing from OBU's conversation
  });
  // After the switch, brand reads are for All The Best Co only.
  const afterSwitch = competitorReads.slice(competitorReads.lastIndexOf(OBU.id) + 1);
  expect(afterSwitch.length).toBeGreaterThan(0);
  expect(new Set(afterSwitch)).toEqual(new Set([BEST.id]));
  await page.keyboard.press("Escape");

  // And back: OBU starts fresh too (one thread per client, not kept per client).
  await switchTo(page, OBU.name, OBU.slug);
  dialog = await openAskBlip(page);
  await expect(dialog.getByText("What should we post this week?")).toHaveCount(0);
  await expect(dialog.getByText("Here’s what I see for All The Best Co.")).toHaveCount(0);
  await ask(dialog, "Which format works best?");
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]).toMatchObject({ clientId: OBU.id, history: [] });
});
