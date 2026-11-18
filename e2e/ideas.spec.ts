import { expect, test, type Page, type Route } from "@playwright/test";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk } from "./helpers";
import { NOW } from "./overview-fixtures";

/*
 * Slice 10a Idea board (14a / 14b / M09). An in-memory `ideas` table answers GET / POST, and the
 * private `idea-images` bucket is stubbed (upload, signed URLs, image files). Nothing reaches Supabase.
 */
test.use({ timezoneId: "UTC" });

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

type Row = Record<string, unknown> & { id: string; kind: string };
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000 - 60_000).toISOString();
const idea = (id: string, kind: string, extra: Partial<Row> = {}): Row => ({
  id,
  kind,
  note: null,
  image_path: null,
  link_url: null,
  source_snapshot: null,
  platform: null,
  format: null,
  tags: [],
  planned_card_id: null,
  created_at: daysAgo(1),
  creator: { full_name: "Fatima Noor" },
  planned: null,
  ...extra,
});

// Figma 14b, newest first.
const SEED: Row[] = [
  idea("i1", "screenshot", {
    note: "“Day in my life on a plan” videos are everywhere this week. Try an OBU clinician version.",
    image_path: "client-1/i1.webp",
    platform: "tiktok",
    tags: ["Trend", "Video"],
    created_at: daysAgo(2),
  }),
  idea("i2", "link", {
    link_url: "https://www.tiktok.com/@creator",
    note: "Great hook in the first 2 seconds. Saved for the hook, not the topic.",
    platform: "tiktok",
    tags: ["Hook"],
    creator: { full_name: "Ahmad Raza" },
  }),
  idea("i3", "screenshot", {
    note: "Love this carousel cover: big number, tiny subtitle. Use for “5 swaps” post.",
    image_path: "client-1/i3.webp",
    platform: "instagram",
    tags: ["Design", "Carousel"],
    created_at: daysAgo(7),
  }),
  idea("i4", "link", {
    link_url: "https://www.instagram.com/p/C0abc123/",
    note: "Brand using a soft yellow palette for health tips",
    platform: "instagram",
    tags: ["Look & feel"],
    creator: { full_name: "Sherry Khan" },
    created_at: daysAgo(3),
  }),
  idea("i5", "note", {
    note: "Series idea: “Ask a clinician Tuesdays”. Fits the Tue 6–9 pm slot.",
    tags: ["Series"],
    planned_card_id: "k1",
    planned: { id: "k1", date: "2027-01-05" },
    created_at: daysAgo(5),
  }),
  idea("i6", "post", {
    note: "3 things nobody tells you about starting treatment",
    platform: "instagram",
    format: "reel",
    source_snapshot: {
      brand: "Hers",
      date: "2026-11-12T15:00:00Z",
      caption: "3 things nobody tells you about starting treatment",
      likes: 18400,
      comments: 1102,
      format: "reel",
      saved_from: "overview",
    },
    created_at: daysAgo(4),
  }),
  idea("i7", "ai", {
    note: "Weekly clinician Q&A on TikTok, modelled on Hims’ best format.",
    platform: "tiktok",
    tags: ["Q&A"],
    creator: null,
    created_at: daysAgo(0),
  }),
  idea("i8", "screenshot", {
    note: "Comment section full of “is this covered by insurance?” Worth a FAQ post.",
    image_path: "client-1/i8.webp",
    platform: "instagram",
    tags: ["Audience question"],
    created_at: daysAgo(14),
  }),
].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

// Stand-in images (fixed size + colour so screenshots are stable).
const svg = (w: number, h: number, fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${fill}"/></svg>`;
const IMAGES: Record<string, string> = {
  "client-1/i1.webp": svg(400, 520, "#b0e9fd"),
  "client-1/i3.webp": svg(400, 380, "#f4eb02"),
  "client-1/i8.webp": svg(400, 470, "#d1e0d4"),
};

type Upload = { path: string; bytes: number; webp: boolean };

async function setup(page: Page, { seed = SEED, failList = false } = {}) {
  const rows: Row[] = seed.map((r) => ({ ...r }));
  const inserts: Record<string, unknown>[] = [];
  const uploads: Upload[] = [];
  await page.clock.setFixedTime(NOW);
  await stubSupabase(page);
  await signInAs(page);

  await page.route("**/rest/v1/ideas**", async (r: Route) => {
    const req = r.request();
    if (req.method() === "GET") {
      if (failList) return r.fulfill(json({ message: "boom" }, 500));
      return r.fulfill(json(rows));
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      const row = Array.isArray(body) ? body[0] : body;
      inserts.push(row);
      rows.unshift(
        idea(String(row.id), String(row.kind), {
          ...row,
          created_at: NOW.toISOString(),
          creator: { full_name: "Fatima Noor" },
        }),
      );
      return r.fulfill({ status: 201, body: "" });
    }
    return r.fallback();
  });

  // Upload: POST /storage/v1/object/idea-images/{path}
  await page.route("**/storage/v1/object/idea-images/**", async (r) => {
    const req = r.request();
    const path = decodeURIComponent(new URL(req.url()).pathname.split("/idea-images/")[1]);
    const body = req.postDataBuffer() ?? Buffer.alloc(0);
    uploads.push({
      path,
      bytes: body.length,
      webp: body.includes("image/webp") || body.subarray(8, 12).toString() === "WEBP",
    });
    IMAGES[path] = svg(400, 300, "#e9e9e3");
    return r.fulfill(json({ Key: `idea-images/${path}`, Id: "x" }));
  });
  // Signed URLs (POST list) and the signed files themselves (GET).
  await page.route("**/storage/v1/object/sign/idea-images**", async (r) => {
    const req = r.request();
    if (req.method() === "POST") {
      const { paths } = req.postDataJSON() as { paths: string[] };
      return r.fulfill(
        json(
          paths.map((p) => ({
            path: p,
            signedURL: `/object/sign/idea-images/${p}?token=t`,
            error: null,
          })),
        ),
      );
    }
    const path = decodeURIComponent(new URL(req.url()).pathname.split("/idea-images/")[1]);
    return r.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: IMAGES[path] ?? svg(10, 10, "#ccc"),
    });
  });

  return { rows, inserts, uploads };
}

async function open(page: Page, path = "/ideas") {
  await page.goto(path);
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768;

/** Fires a real paste event carrying a big generated image (so compression has work to do). */
async function pasteImage(page: Page, width = 2400, height = 1600) {
  await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#b0e9fd");
      g.addColorStop(1, "#f8678f");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Some detail so the file isn't trivially small.
      for (let i = 0; i < 4000; i++) {
        ctx.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`;
        ctx.fillRect((i * 97) % w, (i * 53) % h, 12, 12);
      }
      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "shot.png", { type: "image/png" }));
      document.body.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    },
    [width, height] as const,
  );
}

async function pasteText(page: Page, text: string) {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    document.body.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, text);
}

test("ideas — board like Figma 14b / M09", async ({ page }, info) => {
  await setup(page);
  await open(page);
  await expect(page.getByRole("button", { name: "All · 8" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Planned · ").first()).toBeVisible();
  await expect(page.locator('img[src*="i1.webp"]')).toBeVisible();
  if (isDesktop(page)) {
    await expect(page.getByText("tiktok.com/@creator")).toBeVisible();
    await expect(page.getByText("instagram.com/p/…")).toBeVisible();
    await expect(page.getByText("FATIMA · 2 DAYS AGO")).toBeVisible();
    await expect(page.getByText("SAVED FROM OVERVIEW")).toBeVisible();
    await expect(page.getByText("FROM HERS · 12 NOV")).toBeVisible();
    await expect(page.getByText("18.4K likes · 1.1K comments")).toBeVisible();
    await expect(page.getByText("BLIP · TODAY").filter({ visible: true })).toBeVisible();
  } else {
    await expect(page.getByText("FATIMA · 2D")).toBeVisible();
    await expect(page.getByText("FROM HERS", { exact: true })).toBeVisible();
    await tapTargetsOk(page);
  }
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`ideas-board-${info.project.name}.png`, { fullPage: true });
});

test("ideas — planned badge opens its calendar card", async ({ page }) => {
  await setup(page);
  await open(page);
  await page.getByRole("link", { name: /Planned/ }).click();
  await expect(page).toHaveURL(/\/calendar\?date=2027-01-05&card=k1$/);
});

test("ideas — tabs and search", async ({ page }) => {
  await setup(page);
  await open(page);
  await page.getByRole("button", { name: "Links · 2" }).click();
  await expect(page).toHaveURL(/tab=link/);
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByRole("button", { name: "AI ideas · 1" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  if (isDesktop(page)) {
    await page.getByRole("button", { name: "All · 8" }).click();
    await page.getByRole("searchbox", { name: "Search ideas" }).fill("clinician");
    await expect(page.getByRole("article")).toHaveCount(3);
    await page.getByRole("searchbox", { name: "Search ideas" }).fill("nothing like this");
    await expect(page.getByText("No ideas match “nothing like this”.")).toBeVisible();
  }
});

test("ideas — paste a screenshot, compress, add a note and tag, save (14a)", async ({
  page,
}, info) => {
  test.skip(!isDesktop(page), "keyboard paste is a desktop/tablet action; phones use the + sheet");
  const { inserts, uploads } = await setup(page);
  await open(page);
  await pasteImage(page);
  const draft = page.getByRole("article", { name: "Unsaved screenshot" });
  await expect(draft.getByText("JUST PASTED")).toBeVisible();
  await expect(
    page.getByText("Screenshot pasted from clipboard. Add a note and save."),
  ).toBeVisible();
  await expect(draft.getByRole("img", { name: "Screenshot to save" })).toBeVisible();
  await expect(draft.getByRole("textbox", { name: "Note" })).toBeFocused();
  await draft.getByRole("textbox", { name: "Note" }).fill("Clinician version of this trend");
  await draft.getByRole("button", { name: "+ tag" }).click();
  await draft.getByRole("textbox", { name: "New tag" }).fill("Trend");
  await draft.getByRole("textbox", { name: "New tag" }).press("Enter");
  await expect(draft.getByRole("button", { name: "Remove tag Trend" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(`ideas-draft-${info.project.name}.png`);

  await draft.getByRole("button", { name: "Save idea" }).click();
  await expect(page.getByText("Saved to idea board")).toBeVisible();
  await expect(page.getByRole("article", { name: "Unsaved screenshot" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "All · 9" })).toBeVisible();

  expect(uploads).toHaveLength(1);
  const [up] = uploads;
  const insert = inserts[0];
  expect(up.path).toBe(`client-1/${String(insert.id)}.webp`);
  expect(up.webp).toBe(true);
  expect(up.bytes).toBeLessThan(205 * 1024); // ~200 KB target + form overhead
  expect(insert).toMatchObject({
    client_id: "client-1",
    kind: "screenshot",
    note: "Clinician version of this trend",
    tags: ["Trend"],
    image_path: up.path,
  });
});

test("ideas — paste on another page opens the board; plain text there is ignored", async ({
  page,
}) => {
  test.skip(!isDesktop(page), "keyboard paste is a desktop/tablet action");
  await setup(page);
  await page.route("**/rest/v1/competitors**", (r) => r.fulfill(json([])));
  await open(page, "/competitors");
  await pasteText(page, "just some words");
  await expect(page).toHaveURL(/\/competitors$/);
  await pasteText(page, "https://www.instagram.com/p/xyz/");
  await expect(page).toHaveURL(/\/ideas$/);
  const draft = page.getByRole("article", { name: "Unsaved link" });
  await expect(draft.getByRole("textbox", { name: "Link" })).toHaveValue(
    "https://www.instagram.com/p/xyz/",
  );
  await expect(draft.getByRole("img", { name: "Instagram" })).toBeVisible();
});

test("ideas — paste is ignored while typing", async ({ page }) => {
  test.skip(!isDesktop(page), "keyboard paste is a desktop/tablet action");
  await setup(page);
  await open(page);
  await page.getByRole("searchbox", { name: "Search ideas" }).focus();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "https://example.com/a");
    document.activeElement!.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByRole("article", { name: "Unsaved link" })).toHaveCount(0);
});

test("ideas — add a link: invalid, then valid", async ({ page }) => {
  const { inserts } = await setup(page);
  await open(page);
  if (isDesktop(page)) await page.getByRole("button", { name: "Link", exact: true }).click();
  else {
    await page.getByRole("button", { name: "Add an idea" }).click();
    await page.getByRole("button", { name: "Add link" }).click();
  }
  const draft = page.getByRole("article", { name: "Unsaved link" });
  const link = draft.getByRole("textbox", { name: "Link" });
  await expect(link).toBeFocused();
  await link.fill("not a link");
  await expect(draft.getByText("That doesn't look like a web link.")).toBeVisible();
  await expect(draft.getByRole("button", { name: "Save idea" })).toBeDisabled();
  await link.fill("tiktok.com/@creator/video/1");
  await draft.getByRole("textbox", { name: "Note" }).fill("Great hook");
  await draft.getByRole("button", { name: "Save idea" }).click();
  await expect(page.getByText("Saved to idea board")).toBeVisible();
  expect(inserts[0]).toMatchObject({
    kind: "link",
    link_url: "https://tiktok.com/@creator/video/1",
    platform: "tiktok",
    note: "Great hook",
    image_path: null,
  });
});

test("ideas — write a note (empty can't be saved), discard another", async ({ page }) => {
  const { inserts } = await setup(page);
  await open(page);
  const addNote = async () => {
    if (isDesktop(page)) await page.getByRole("button", { name: "Note", exact: true }).click();
    else {
      await page.getByRole("button", { name: "Add an idea" }).click();
      await page.getByRole("button", { name: "Write a note" }).click();
    }
  };
  await addNote();
  const draft = page.getByRole("article", { name: "Unsaved note" });
  await expect(draft.getByRole("textbox", { name: "Your idea" })).toBeFocused();
  await expect(draft.getByRole("button", { name: "Save idea" })).toBeDisabled();
  await draft.getByRole("textbox", { name: "Your idea" }).fill("Myth vs fact series");
  await draft.getByRole("textbox", { name: "Your idea" }).press("ControlOrMeta+Enter");
  await expect(page.getByText("Saved to idea board")).toBeVisible();
  expect(inserts[0]).toMatchObject({ kind: "note", note: "Myth vs fact series", tags: [] });

  await addNote();
  await page
    .getByRole("article", { name: "Unsaved note" })
    .getByRole("button", { name: "Discard" })
    .click();
  await expect(page.getByRole("article", { name: "Unsaved note" })).toHaveCount(0);
  expect(inserts).toHaveLength(1);
});

test("ideas — choose from photos (M09 sheet)", async ({ page }, info) => {
  test.skip(isDesktop(page), "phones only");
  const { uploads } = await setup(page);
  await open(page);
  await page.getByRole("button", { name: "Add an idea" }).click();
  const sheet = page.getByRole("dialog", { name: "Add an idea" });
  await expect(sheet.getByRole("button", { name: "Paste screenshot" })).toBeVisible();
  await page.waitForTimeout(300); // sheet slide-in
  await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`ideas-add-sheet-${info.project.name}.png`);

  const chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: "Choose from photos" }).click();
  const png = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 1170;
    c.height = 2532;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fad7ff";
    ctx.fillRect(0, 0, c.width, c.height);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), "image/png"));
    return [...new Uint8Array(await b.arrayBuffer())];
  });
  await (
    await chooser
  ).setFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from(png) });
  const draft = page.getByRole("article", { name: "Unsaved screenshot" });
  await expect(draft.getByText("NEW SCREENSHOT")).toBeVisible();
  await expect(draft.getByRole("img", { name: "Screenshot to save" })).toBeVisible();
  await draft.getByRole("button", { name: "Save idea" }).click();
  await expect(page.getByText("Saved to idea board")).toBeVisible();
  expect(uploads[0].webp).toBe(true);
});

test("ideas — drop image files on the board", async ({ page }) => {
  test.skip(!isDesktop(page), "drag and drop is tablet/desktop; phones use the photo picker");
  await setup(page);
  await open(page);
  const dt = await page.evaluateHandle(async () => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 600;
    c.getContext("2d")!.fillRect(0, 0, 800, 600);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), "image/png"));
    const d = new DataTransfer();
    d.items.add(new File([b], "a.png", { type: "image/png" }));
    d.items.add(new File([b], "b.png", { type: "image/png" }));
    return d;
  });
  const board = page.getByRole("heading", { level: 1 });
  await board.dispatchEvent("dragenter", { dataTransfer: dt });
  await board.dispatchEvent("dragover", { dataTransfer: dt });
  await board.dispatchEvent("drop", { dataTransfer: dt });
  await expect(page.getByRole("article", { name: "Unsaved screenshot" })).toHaveCount(2);
});

test("ideas — empty board", async ({ page }, info) => {
  await setup(page, { seed: [] });
  await open(page);
  await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
  if (!isDesktop(page)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`ideas-empty-${info.project.name}.png`);
});

test("ideas — loading fails, then retry works", async ({ page }) => {
  await setup(page, { failList: true });
  await open(page);
  await expect(page.getByRole("heading", { name: "Couldn't load ideas" })).toBeVisible({
    timeout: 15_000,
  });
  await page.unroute("**/rest/v1/ideas**");
  await page.route("**/rest/v1/ideas**", (r) => r.fulfill(json(SEED)));
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "All · 8" })).toBeVisible();
});
