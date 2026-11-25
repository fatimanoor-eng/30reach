import { expect, test, type Page, type Route } from "@playwright/test";
import { noSidewaysScroll, signInAs, stubSupabase, tapTargetsOk, appUrl } from "./helpers";
import { NOW } from "./overview-fixtures";
import { readFileSync } from "node:fs";

const us2026: unknown = JSON.parse(
  readFileSync(
    new URL("../supabase/functions/holidays/fixtures/us-2026.json", import.meta.url),
    "utf8",
  ),
);

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
/** The signed-in test user (helpers › signInAs) and a teammate. */
const ME = "00000000-0000-4000-8000-000000000001";
const AHMAD = "u-ahmad";
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000 - 60_000).toISOString();
const idea = (id: string, kind: string, extra: Partial<Row> = {}): Row => ({
  id,
  kind,
  note: null,
  image_path: null,
  image_width: null,
  image_height: null,
  link_url: null,
  source_snapshot: null,
  platform: null,
  format: null,
  tags: [],
  planned_card_id: null,
  created_at: daysAgo(1),
  created_by: ME,
  creator: { full_name: "Fatima Noor" },
  planned: null,
  ...extra,
});

// Figma 14b, newest first.
const SEED: Row[] = [
  idea("i1", "screenshot", {
    note: "“Day in my life on a plan” videos are everywhere this week. Try an OBU clinician version.",
    image_path: "client-1/i1.webp", // 9:16 phone screenshot → 1 column
    image_width: 900,
    image_height: 1600,
    platform: "tiktok",
    tags: ["Trend", "Video"],
    created_at: daysAgo(2),
  }),
  idea("i2", "link", {
    link_url: "https://www.tiktok.com/@creator",
    note: "Great hook in the first 2 seconds. Saved for the hook, not the topic.",
    platform: "tiktok",
    tags: ["Hook"],
    created_by: AHMAD,
    creator: { full_name: "Ahmad Raza" },
  }),
  idea("i3", "screenshot", {
    note: "Love this carousel cover: big number, tiny subtitle. Use for “5 swaps” post.",
    image_path: "client-1/i3.webp", // 16:9 → 2 columns
    image_width: 1600,
    image_height: 900,
    platform: "instagram",
    tags: ["Design", "Carousel"],
    created_at: daysAgo(7),
  }),
  idea("i4", "link", {
    link_url: "https://www.instagram.com/p/C0abc123/",
    note: "Brand using a soft yellow palette for health tips",
    platform: "instagram",
    tags: ["Look & feel"],
    created_by: "u-sherry",
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
    image_path: "client-1/i6.webp", // copied thumbnail (Slice 10c), 4:5 → 1 column
    image_width: 480,
    image_height: 600,
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
    created_by: null, // AI idea: no person
    creator: null,
    created_at: daysAgo(0),
  }),
  idea("i8", "screenshot", {
    note: "Comment section full of “is this covered by insurance?” Worth a FAQ post.",
    image_path: "client-1/i8.webp", // 1:1 → 1 column
    image_width: 1000,
    image_height: 1000,
    platform: "instagram",
    tags: ["Audience question"],
    created_at: daysAgo(14),
  }),
].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

// Stand-in images (fixed size + colour so screenshots are stable).
const svg = (w: number, h: number, fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${fill}"/></svg>`;
const IMAGES: Record<string, string> = {
  "client-1/i1.webp": svg(450, 800, "#b0e9fd"),
  "client-1/i3.webp": svg(800, 450, "#f4eb02"),
  "client-1/i8.webp": svg(500, 500, "#d1e0d4"),
  "client-1/i6.webp": svg(480, 600, "#f8678f"),
};

type Upload = { path: string; bytes: number; webp: boolean; jpeg: boolean };

type Comment = {
  id: string;
  idea_id: string;
  body: string;
  created_at: string;
  author: { full_name: string };
};
const COMMENTS: Comment[] = [
  {
    id: "c1",
    idea_id: "i1",
    body: "Love this. Could open our January series.",
    created_at: daysAgo(1),
    author: { full_name: "Ahmad Raza" },
  },
  {
    id: "c2",
    idea_id: "i1",
    body: "Keep it short, under 30 seconds.",
    created_at: daysAgo(0),
    author: { full_name: "Sherry Khan" },
  },
];

async function setup(
  page: Page,
  {
    seed = SEED,
    failList = false,
    planError = null as string | null,
    role = "admin" as "admin" | "member",
    refuseDelete = false,
  } = {},
) {
  const rows: Row[] = seed.map((r) => ({ ...r }));
  const inserts: Record<string, unknown>[] = [];
  const uploads: Upload[] = [];
  const comments: Comment[] = COMMENTS.map((c) => ({ ...c }));
  const calls: { method: string; url: string; body: unknown }[] = [];
  const removed: string[] = [];
  await page.clock.setFixedTime(NOW);
  await stubSupabase(page, { role, full_name: "Fatima Noor" });
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
    const id = new URL(req.url()).searchParams.get("id")?.replace("eq.", "");
    if (req.method() === "PATCH") {
      const body = req.postDataJSON() as Record<string, unknown>;
      calls.push({ method: "PATCH", url: req.url(), body });
      Object.assign(
        rows.find((x) => x.id === id)!,
        body,
      );
      return r.fulfill({ status: 204 });
    }
    if (req.method() === "DELETE") {
      calls.push({ method: "DELETE", url: req.url(), body: null });
      rows.splice(
        rows.findIndex((x) => x.id === id),
        1,
      );
      return r.fulfill({ status: 204 });
    }
    return r.fallback();
  });

  await page.route("**/rest/v1/idea_comments**", async (r: Route) => {
    const req = r.request();
    if (req.method() === "GET") {
      const ideaId = new URL(req.url()).searchParams.get("idea_id")?.replace("eq.", "");
      return r.fulfill(json(comments.filter((c) => c.idea_id === ideaId)));
    }
    const body = req.postDataJSON() as { idea_id: string; body: string };
    calls.push({ method: "POST comment", url: req.url(), body });
    comments.push({
      id: `c${comments.length + 1}`,
      ...body,
      created_at: NOW.toISOString(),
      author: { full_name: "Fatima Noor" },
    });
    return r.fulfill({ status: 201, body: "" });
  });

  // delete_ideas / restore_ideas (Select mode), same rule: skips ideas this person may not delete.
  await page.route("**/rest/v1/rpc/delete_ideas", async (r: Route) => {
    const { p_ids } = r.request().postDataJSON() as { p_ids: string[] };
    calls.push({ method: "RPC delete_ideas", url: r.request().url(), body: { p_ids } });
    const deleted: { idea: Row; comments: Comment[] }[] = [];
    let skipped = 0;
    for (const id of p_ids) {
      const row = rows.find((x) => x.id === id);
      if (!row) continue;
      if (role !== "admin" && row.created_by !== ME) {
        skipped++;
        continue;
      }
      rows.splice(rows.indexOf(row), 1);
      const cs = comments.filter((c) => c.idea_id === id);
      for (const c of cs) comments.splice(comments.indexOf(c), 1);
      deleted.push({ idea: { ...row }, comments: cs });
    }
    return r.fulfill(json({ deleted, skipped }));
  });
  await page.route("**/rest/v1/rpc/restore_ideas", async (r: Route) => {
    const { p_snapshots } = r.request().postDataJSON() as {
      p_snapshots: { idea: Row; comments: Comment[] }[];
    };
    calls.push({ method: "RPC restore_ideas", url: r.request().url(), body: p_snapshots });
    for (const snap of p_snapshots) {
      rows.push(snap.idea);
      comments.push(...snap.comments);
    }
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return r.fulfill(json(p_snapshots.length));
  });

  // delete_idea / restore_idea, with the database's rule: the creator or an admin.
  await page.route("**/rest/v1/rpc/delete_idea", async (r: Route) => {
    const { p_idea_id } = r.request().postDataJSON() as { p_idea_id: string };
    calls.push({ method: "RPC delete_idea", url: r.request().url(), body: { p_idea_id } });
    const row = rows.find((x) => x.id === p_idea_id)!;
    if (refuseDelete || (role !== "admin" && row.created_by !== ME))
      return r.fulfill(json({ code: "42501", message: "not_allowed" }, 403));
    rows.splice(rows.indexOf(row), 1);
    const snapshot = {
      idea: { ...row },
      comments: comments.filter((c) => c.idea_id === p_idea_id),
    };
    for (const c of snapshot.comments) comments.splice(comments.indexOf(c), 1);
    return r.fulfill(json(snapshot));
  });
  await page.route("**/rest/v1/rpc/restore_idea", async (r: Route) => {
    const { p_snapshot } = r.request().postDataJSON() as {
      p_snapshot: { idea: Row; comments: Comment[] };
    };
    calls.push({ method: "RPC restore_idea", url: r.request().url(), body: p_snapshot });
    rows.push(p_snapshot.idea);
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    comments.push(...p_snapshot.comments);
    return r.fulfill(json(p_snapshot.idea.id));
  });

  // plan_idea: makes the card and marks the idea planned (like the SQL function).
  await page.route("**/rest/v1/rpc/plan_idea", async (r: Route) => {
    const body = r.request().postDataJSON() as Record<string, string>;
    calls.push({ method: "RPC plan_idea", url: r.request().url(), body });
    if (planError) return r.fulfill(json({ code: "P0001", message: planError }, 400));
    const card = { id: "card-new", date: body.p_date };
    const row = rows.find((x) => x.id === body.p_idea_id)!;
    Object.assign(row, { planned_card_id: card.id, planned: card });
    return r.fulfill(json({ ...card, title: body.p_title, status: "idea", origin: "idea" }));
  });

  // Holidays for the Plan it calendar's dots (2026 from the real Nager response).
  await page.route("**/rest/v1/holiday_cache**", (r) => {
    const year = new URL(r.request().url()).searchParams.get("year");
    const single = (r.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const row = { data: year === "eq.2026" ? us2026 : [], fetched_at: NOW.toISOString() };
    return r.fulfill(json(single ? row : [row]));
  });

  // Remove images: DELETE /storage/v1/object/idea-images { prefixes }
  await page.route("**/storage/v1/object/idea-images", async (r) => {
    const { prefixes } = r.request().postDataJSON() as { prefixes: string[] };
    removed.push(...prefixes);
    return r.fulfill(json(prefixes.map((name) => ({ name }))));
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
      jpeg: body.includes("image/jpeg") || (body[0] === 0xff && body[1] === 0xd8),
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

  return { rows, inserts, uploads, calls, removed };
}

async function open(page: Page, path = "/ideas") {
  await page.goto(appUrl(path));
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

test("ideas — a LinkedIn post idea and a LinkedIn link (Slice 15c)", async ({ page }, info) => {
  const linkedIn = [
    idea("li1", "post", {
      note: "Do our own care report as a document post",
      platform: "linkedin",
      format: "document",
      source_snapshot: {
        brand: "Hims",
        date: "2026-11-02T15:00:00Z",
        caption: "Our 2026 care report: five numbers that surprised our team",
        likes: 700,
        comments: 23,
        format: "document",
        saved_from: "linkedin",
      },
      created_at: daysAgo(1),
    }),
    idea("li2", "link", {
      link_url: "https://www.linkedin.com/feed/update/urn:li:activity:123/",
      note: "Strong opening line, plain and human",
      platform: "linkedin",
      created_at: daysAgo(2),
    }),
  ];
  await setup(page, { seed: linkedIn });
  await open(page);
  const reactions = page.getByText("700 reactions · 23 comments").filter({ visible: true });
  if (isDesktop(page)) {
    await expect(reactions).toBeVisible();
    await expect(page.getByText("SAVED FROM LINKEDIN")).toBeVisible();
    await expect(page.getByText("linkedin.com/feed/…")).toBeVisible();
    await expect(page.getByRole("img", { name: "LinkedIn" }).first()).toBeVisible();
  }
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`ideas-linkedin-${info.project.name}.png`, {
    fullPage: true,
  });
});

test("ideas — a Facebook post idea and a Facebook link (Slice 16c)", async ({ page }, info) => {
  const facebook = [
    idea("fb1", "post", {
      note: "Do a five-swaps album for January",
      platform: "facebook",
      format: "carousel",
      source_snapshot: {
        brand: "WeightWatchers",
        date: "2026-11-14T15:00:00Z",
        caption: "Five lunch swaps that actually fill you up",
        likes: 59,
        comments: 11,
        format: "carousel",
        saved_from: "facebook",
      },
      created_at: daysAgo(1),
    }),
    idea("fb2", "link", {
      link_url: "https://www.facebook.com/weightwatchers/posts/pfbid0Jm58X4TR",
      note: "Question in the first line, recipe after",
      platform: "facebook",
      created_at: daysAgo(2),
    }),
  ];
  await setup(page, { seed: facebook });
  await open(page);
  const reactions = page.getByText("59 reactions · 11 comments").filter({ visible: true });
  if (isDesktop(page)) {
    await expect(reactions).toBeVisible();
    await expect(page.getByText("SAVED FROM FACEBOOK")).toBeVisible();
    await expect(page.getByText("facebook.com/weightwatchers/…")).toBeVisible();
    await expect(page.getByRole("img", { name: "Facebook" }).first()).toBeVisible();
    await expect(page.getByText(/Album/).filter({ visible: true }).first()).toBeVisible();
  }
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`ideas-facebook-${info.project.name}.png`, {
    fullPage: true,
  });
});

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

/**
 * Bento checks: no two tiles overlap; tiles stacked in a column are at least the gap apart; and
 * each tile spans the fewest 8 px rows that fit its real height plus the gap (so the space below
 * it is the gap, plus less than one row). Larger holes can appear above a 2-column tile: it starts
 * where both columns are free, and `dense` only fills a hole when a later tile fits it.
 */
async function checkBento(page: Page) {
  const tiles = await page.locator("[data-columns]").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const grid = getComputedStyle(el.parentElement!);
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        span: Number(getComputedStyle(el).gridRowEnd.replace("span ", "")),
        unit: parseFloat(grid.gridAutoRows),
        gap: parseFloat(grid.columnGap),
      };
    }),
  );
  for (const [i, a] of tiles.entries()) {
    expect(a.unit).toBe(8);
    // Fewest rows that hold the tile and the gap below it.
    expect(a.span * a.unit).toBeGreaterThanOrEqual(a.h + a.gap - 0.5);
    expect(a.span * a.unit).toBeLessThan(a.h + a.gap + a.unit + 0.5);
    for (const b of tiles.slice(i + 1)) {
      const overlapX = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1;
      const overlapY = a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      expect(overlapX && overlapY, "tiles overlap").toBe(false);
      if (overlapX && b.y >= a.y) expect(b.y - (a.y + a.h)).toBeGreaterThanOrEqual(a.gap - 0.5);
    }
  }
  return { gap: tiles[0].gap };
}

test("ideas — bento: spans by shape, pictures never cropped, heights from content", async ({
  page,
}) => {
  await setup(page);
  await open(page);
  const tile = (text: string) => page.locator("[data-columns]").filter({ hasText: text });
  const wide = tile("Love this carousel cover"); // 16:9
  const tall = tile("Day in my life"); // 9:16
  const square = tile("covered by insurance"); // 1:1
  await expect(wide).toHaveAttribute("data-columns", "2");
  await expect(tall).toHaveAttribute("data-columns", "1");
  await expect(square).toHaveAttribute("data-columns", "1");
  await expect(tile("Brand using a soft yellow")).toHaveAttribute("data-columns", "1");

  // Each picture is shown at its own ratio: nothing cropped.
  for (const [t, ratio] of [
    [wide, 16 / 9],
    [tall, 9 / 16],
    [square, 1],
  ] as const) {
    const img = t.locator("img");
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    const { box, natural } = await img.evaluate((el: HTMLImageElement) => ({
      box: el.clientWidth / el.clientHeight,
      natural: el.naturalWidth / el.naturalHeight,
    }));
    expect(Math.abs(box - ratio) / ratio).toBeLessThan(0.02);
    expect(Math.abs(natural - ratio) / ratio).toBeLessThan(0.02);
  }

  // The 2-column tile is two columns plus the gap wide.
  const { gap } = await checkBento(page);
  const w2 = (await wide.boundingBox())!.width;
  const w1 = (await tall.boundingBox())!.width;
  expect(Math.abs(w2 - (2 * w1 + gap))).toBeLessThan(2);

  // No 2×2 feature tile any more: nothing wider than 2 columns.
  await expect(page.locator('[data-columns="2"]')).toHaveCount(1);

  // Text is clamped with an ellipsis.
  const clamp = await tile("Day in my life")
    .locator("p.font-medium")
    .evaluate((el) => getComputedStyle(el).webkitLineClamp);
  expect(clamp).toBe("3");

  // Resize: spans are measured again and still don't overlap.
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: Math.round(size.width * 0.85), height: size.height });
  await page.waitForTimeout(200);
  await checkBento(page);
  await page.setViewportSize(size);
  await page.waitForTimeout(200);
  await checkBento(page);
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
  // Compressing a big image can take a few seconds when every test runs in parallel.
  await expect(draft.getByRole("img", { name: "Screenshot to save" })).toBeVisible({
    timeout: 15_000,
  });
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
    // 2400 × 1600 pasted → at most 1600 px on the long side, saved with the idea.
    image_width: 1600,
    image_height: 1067,
  });
});

test("ideas — browser without WebP saves a JPEG instead", async ({ page }) => {
  test.skip(!isDesktop(page), "keyboard paste is a desktop/tablet action");
  // Like older Safari: a canvas asked for WebP hands back a PNG.
  await page.addInitScript(() => {
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type, quality) {
      return toBlob.call(this, cb, type === "image/webp" ? "image/png" : type, quality);
    };
  });
  const { inserts, uploads } = await setup(page);
  await open(page);
  await pasteImage(page);
  const draft = page.getByRole("article", { name: "Unsaved screenshot" });
  // Compressing a big image can take a few seconds when every test runs in parallel.
  await expect(draft.getByRole("img", { name: "Screenshot to save" })).toBeVisible({
    timeout: 15_000,
  });
  await draft.getByRole("button", { name: "Save idea" }).click();
  await expect(page.getByText("Saved to idea board")).toBeVisible();
  const [up] = uploads;
  expect(up.path).toBe(`client-1/${String(inserts[0].id)}.jpg`);
  expect(up.jpeg).toBe(true);
  expect(up.webp).toBe(false);
  expect(up.bytes).toBeLessThan(205 * 1024);
  expect(inserts[0]).toMatchObject({ image_path: up.path });
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
  // Compressing a big image can take a few seconds when every test runs in parallel.
  await expect(draft.getByRole("img", { name: "Screenshot to save" })).toBeVisible({
    timeout: 15_000,
  });
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
  await expect(page.getByRole("heading", { name: "Ideas didn’t load" })).toBeVisible({
    timeout: 15_000,
  });
  await page.unroute("**/rest/v1/ideas**");
  await page.route("**/rest/v1/ideas**", (r) => r.fulfill(json(SEED)));
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "All · 8" })).toBeVisible();
});

// ───────────────────────────── 10b: idea detail (14c) and Plan it (14d)

const DAY_IN_MY_LIFE = /^Open idea: “Day in my life on a plan”/;

async function openDetail(page: Page, name = DAY_IN_MY_LIFE) {
  await page.getByRole("button", { name }).click();
  const drawer = page.getByRole("dialog", { name: "Idea", exact: true });
  await expect(drawer).toBeVisible();
  await page.waitForTimeout(300); // drawer slide-in
  return drawer;
}

test("idea detail — 14c full image, note, tags, comments", async ({ page }, info) => {
  await setup(page);
  await open(page);
  const drawer = await openDetail(page);
  await expect(page).toHaveURL(/[?&]idea=i1(&|$)/);
  await expect(drawer.getByText("SCREENSHOT  ·  FATIMA  ·  2 DAYS AGO")).toBeVisible();
  // The full image: not cropped.
  const img = drawer.locator('img[src*="i1.webp"]');
  await expect(img).toBeVisible();
  expect(await img.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");
  await expect(drawer.getByText("“Day in my life on a plan” videos are everywhere")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Remove tag Trend" })).toBeVisible();
  await expect(drawer.getByText("Love this. Could open our January series.")).toBeVisible();
  await expect(drawer.getByText("Keep it short, under 30 seconds.")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Delete idea" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Plan it" })).toBeVisible();
  if (!isDesktop(page)) {
    await expect(drawer.getByRole("button", { name: "Ideas" })).toBeVisible(); // ‹ Ideas
    await tapTargetsOk(page);
  }
  await expect(page).toHaveScreenshot(`idea-detail-${info.project.name}.png`);

  // Esc closes it and clears the URL.
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page).not.toHaveURL(/idea=/);
});

test("idea detail — planned idea links to its card instead of Plan it", async ({ page }) => {
  await setup(page);
  await open(page, "/ideas?idea=i5");
  const drawer = page.getByRole("dialog", { name: "Idea", exact: true });
  await expect(drawer.getByRole("button", { name: "Plan it" })).toHaveCount(0);
  await drawer.getByRole("link", { name: "Planned · Tue 5 Jan" }).click();
  await expect(page).toHaveURL(/\/calendar\?date=2027-01-05&card=k1$/);
});

test("idea detail — a link to a deleted idea says so", async ({ page }) => {
  await setup(page);
  await open(page, "/ideas?idea=gone");
  await expect(page.getByText("That idea isn’t on the board any more")).toBeVisible();
  await expect(page).not.toHaveURL(/idea=/);
});

test("idea detail — add a comment (Enter posts)", async ({ page }) => {
  const { calls } = await setup(page);
  await open(page);
  const drawer = await openDetail(page);
  const box = drawer.getByRole("textbox", { name: "Add a comment" });
  await box.fill("Let’s film it next week");
  await box.press("Enter");
  await expect(drawer.getByText("Let’s film it next week")).toBeVisible();
  await expect(box).toHaveValue("");
  expect(calls.find((c) => c.method === "POST comment")?.body).toEqual({
    idea_id: "i1",
    body: "Let’s film it next week",
  });
});

test("idea detail — edit tags (saved straight away)", async ({ page }) => {
  const { calls } = await setup(page);
  await open(page);
  const drawer = await openDetail(page);
  await drawer.getByRole("button", { name: "Remove tag Trend" }).click();
  await drawer.getByRole("button", { name: "+ tag" }).click();
  await drawer.getByRole("textbox", { name: "New tag" }).fill("Clinician");
  await drawer.getByRole("textbox", { name: "New tag" }).press("Enter");
  await expect(drawer.getByRole("button", { name: "Remove tag Clinician" })).toBeVisible();
  await expect
    .poll(() => calls.filter((c) => c.method === "PATCH").map((c) => c.body))
    .toEqual([{ tags: ["Video"] }, { tags: ["Video", "Clinician"] }]);
});

test("delete — the creator deletes; the image goes once the Undo toast has gone", async ({
  page,
}) => {
  const { calls, removed } = await setup(page, { role: "member" });
  await open(page);
  const drawer = await openDetail(page);
  await drawer.getByRole("button", { name: "Delete idea" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this idea?" });
  // Esc closes only the confirm; the idea stays open behind it.
  await expect(confirm).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Delete idea" }).click();
  await confirm.getByRole("button", { name: "Delete idea" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: DAY_IN_MY_LIFE })).toHaveCount(0);
  expect(calls.find((c) => c.method === "RPC delete_idea")?.body).toEqual({ p_idea_id: "i1" });

  // Undo is offered; the image is kept (and listed in case the page closes).
  const toast = page.getByRole("status").filter({ hasText: "Deleted the idea" });
  await expect(toast.getByRole("button", { name: "Undo" })).toBeVisible();
  expect(removed).toEqual([]);
  expect(
    await page.evaluate(() => localStorage.getItem("30reach:pending-image-deletes")),
  ).toContain("client-1/i1.webp");

  // The toast goes (✕ here; ~10 s on its own): now the image is removed.
  await toast.getByRole("button", { name: "Dismiss" }).click();
  await expect.poll(() => removed).toEqual(["client-1/i1.webp"]);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("30reach:pending-image-deletes")))
    .toBeNull();
});

test("delete — Undo brings back the idea, its comments and its image", async ({ page }) => {
  const { calls, removed } = await setup(page, { role: "member" });
  await open(page);
  const drawer = await openDetail(page);
  await drawer.getByRole("button", { name: "Delete idea" }).click();
  await page
    .getByRole("dialog", { name: "Delete this idea?" })
    .getByRole("button", { name: "Delete idea" })
    .click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Restored the idea")).toBeVisible();
  await expect(page.getByRole("button", { name: DAY_IN_MY_LIFE })).toBeVisible();
  const restored = calls.find((c) => c.method === "RPC restore_idea")?.body as {
    idea: { id: string };
    comments: unknown[];
  };
  expect(restored.idea.id).toBe("i1");
  expect(restored.comments).toHaveLength(2);
  expect(removed).toEqual([]); // the image was never removed
  await expect(page.locator('img[src*="i1.webp"]').first()).toBeVisible();
  // …and its comments are back.
  await openDetail(page);
  await expect(page.getByText("Keep it short, under 30 seconds.")).toBeVisible();
});

test("delete — someone else's idea: disabled, with who can", async ({ page }, info) => {
  await setup(page, { role: "member" });
  await open(page, "/ideas?idea=i2"); // Ahmad's link
  const drawer = page.getByRole("dialog", { name: "Idea", exact: true });
  const del = drawer.getByRole("button", { name: "Delete idea" });
  await expect(del).toHaveAttribute("aria-disabled", "true");
  const note = "Only Ahmad (who added it) or an admin can delete this idea.";
  await expect(drawer.locator("p", { hasText: note })).toBeVisible();
  await page.waitForTimeout(300); // drawer slide-in
  if (!isDesktop(page)) await tapTargetsOk(page);
  await expect(page).toHaveScreenshot(`idea-delete-blocked-${info.project.name}.png`);
  // Keyboard focus shows the tooltip; a click (Playwright needs `force` on aria-disabled) opens
  // no confirm.
  await del.focus();
  await expect(page.getByRole("tooltip")).toHaveText(note);
  await del.click({ force: true });
  await expect(page.getByRole("dialog", { name: "Delete this idea?" })).toHaveCount(0);

  // AI ideas: admins only.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await open(page, "/ideas?idea=i7");
  await expect(
    page
      .getByRole("dialog", { name: "Idea", exact: true })
      .locator("p", { hasText: "Only an admin can delete AI ideas." }),
  ).toBeVisible();
});

test("delete — an admin can delete anyone's idea", async ({ page }) => {
  const { calls } = await setup(page, { role: "admin" });
  await open(page, "/ideas?idea=i2");
  const drawer = page.getByRole("dialog", { name: "Idea", exact: true });
  await drawer.getByRole("button", { name: "Delete idea" }).click();
  await page
    .getByRole("dialog", { name: "Delete this idea?" })
    .getByRole("button", { name: "Delete idea" })
    .click();
  await expect(page.getByText("Deleted the idea")).toBeVisible();
  expect(calls.some((c) => c.method === "RPC delete_idea")).toBe(true);
});

test("delete — the server refuses (403): says who can", async ({ page }) => {
  await setup(page, { role: "member", refuseDelete: true });
  await open(page);
  const drawer = await openDetail(page);
  await drawer.getByRole("button", { name: "Delete idea" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this idea?" });
  await confirm.getByRole("button", { name: "Delete idea" }).click();
  await expect(
    confirm.getByText("Only Fatima (who added it) or an admin can delete this idea."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(drawer.getByRole("button", { name: "Delete idea" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("delete — the page closes during Undo: the image is still removed", async ({ page }) => {
  const { removed } = await setup(page, { role: "member" });
  await open(page);
  const drawer = await openDetail(page);
  await drawer.getByRole("button", { name: "Delete idea" }).click();
  await page
    .getByRole("dialog", { name: "Delete this idea?" })
    .getByRole("button", { name: "Delete idea" })
    .click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  // The page closes: `pagehide` sends the removal with keepalive. (Fired here directly: Playwright
  // can't intercept requests from a page that is unloading.)
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })),
  );
  await expect.poll(() => removed).toContain("client-1/i1.webp");
});

test("delete — leftovers from an earlier visit are swept", async ({ page }) => {
  const { removed } = await setup(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "30reach:pending-image-deletes",
      JSON.stringify([
        { path: "client-1/old.webp", at: Date.now() - 60_000 },
        { path: "client-1/recent.webp", at: Date.now() - 2_000 },
      ]),
    ),
  );
  await open(page);
  await expect.poll(() => removed).toEqual(["client-1/old.webp"]);
});

test("Plan it — 14d pick a day, platform and format → calendar card", async ({ page }, info) => {
  const { calls } = await setup(page);
  await open(page);
  const drawer = await openDetail(page);
  await drawer.getByRole("button", { name: "Plan it" }).click();
  const plan = page.getByRole("dialog", { name: "Plan this idea" });
  await expect(plan).toBeVisible();

  // November 2026: yellow dots on event days (Thanksgiving), no picking the past.
  await expect(plan.getByText("November 2026")).toBeVisible();
  await expect(plan.getByRole("button", { name: /^Monday 16 November/ })).toBeDisabled();
  await expect(plan.getByRole("button", { name: /^Tuesday 17 November, today/ })).toBeFocused();
  const thanksgiving = plan.getByRole("button", { name: /^Thursday 26 November.*Thanksgiving/ });
  await expect(thanksgiving).toBeVisible();
  await expect(plan.getByRole("button", { name: "Create calendar card" })).toBeDisabled();

  // Keyboard: → moves a day, ↓ a week; Enter picks.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(plan.getByRole("button", { name: /^Wednesday 25 November/ })).toBeFocused();
  await thanksgiving.click();
  await expect(thanksgiving).toHaveAttribute("aria-pressed", "true");
  await expect(
    plan.getByText(
      "Creates an “Idea” card on Thu 26 Nov with this screenshot attached. The idea is marked Planned.",
    ),
  ).toBeVisible();

  // Platform comes from the idea; pick the format with the same select chips as the card drawer.
  await expect(plan.getByRole("button", { name: "Platform: TikTok" })).toBeVisible();
  await plan.getByRole("button", { name: "Format: not set" }).click();
  await plan.getByRole("option", { name: "Video" }).click();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(`plan-it-${info.project.name}.png`);

  await plan.getByRole("button", { name: "Create calendar card" }).click();
  await expect(page.getByText("Planned for Thu 26 Nov")).toBeVisible();
  expect(calls.find((c) => c.method === "RPC plan_idea")?.body).toEqual({
    p_idea_id: "i1",
    p_date: "2026-11-26",
    p_platform: "tiktok",
    p_format: "video",
    p_title: "“Day in my life on a plan” videos are everywhere this week…",
  });
  // Back on the board (the drawer closes so the toast is reachable); the tile shows Planned.
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("link", { name: /Planned · .*26 Nov/ })).toBeVisible();

  // The toast's Open goes to the new card.
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar\?date=2026-11-26&card=card-new$/);
});

test("Plan it — Esc closes the popover, not the drawer", async ({ page }) => {
  test.skip(!isDesktop(page), "phones use a bottom sheet");
  await setup(page);
  await open(page);
  const drawer = await openDetail(page);
  await drawer.getByRole("button", { name: "Plan it" }).click();
  const plan = page.getByRole("dialog", { name: "Plan this idea" });
  await expect(plan).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(plan).toBeHidden();
  await expect(drawer).toBeVisible();
});

test("Plan it — the tile's Plan it link opens straight into Plan it", async ({ page }) => {
  test.skip(!isDesktop(page), "the tile link is hidden on phones (M09)");
  await setup(page);
  await open(page);
  await page.getByRole("button", { name: /^Plan it: Brand using a soft yellow/ }).click();
  await expect(page).toHaveURL(/idea=i4&plan=1/);
  await expect(page.getByRole("dialog", { name: "Plan this idea" })).toBeVisible();
});

test("Plan it — already planned elsewhere: says so", async ({ page }) => {
  await setup(page, { planError: "idea_already_planned" });
  await open(page);
  const drawer = await openDetail(page);
  await drawer.getByRole("button", { name: "Plan it" }).click();
  const plan = page.getByRole("dialog", { name: "Plan this idea" });
  await plan.getByRole("button", { name: /^Thursday 26 November/ }).click();
  await plan.getByRole("button", { name: "Create calendar card" }).click();
  await expect(page.getByText("This idea is already on the calendar.")).toBeVisible();
});

// ───────────────────────────── AI ideas from Plan {month}: suggested day + one-click plan

test("AI idea from Plan {month} — 'Suggested: Thu 31 Dec · TT Video' and 'Plan on Thu 31 Dec'", async ({
  page,
}, info) => {
  const planned = idea("i-plan", "ai", {
    note: "Clinician answers: is Dry January worth it?\nWhy: Q&A videos are Hims’ best TikTok format.",
    platform: "tiktok",
    format: "video",
    source_snapshot: { saved_from: "plan", suggested_date: "2026-12-31", reason: "Q&A videos" },
    created_by: null,
    creator: null,
    created_at: daysAgo(0),
  });
  const passed = idea("i-passed", "ai", {
    note: "Thanksgiving gratitude carousel",
    platform: "instagram",
    format: "carousel",
    source_snapshot: { saved_from: "plan", suggested_date: "2026-11-10" },
    created_by: null,
    creator: null,
    created_at: daysAgo(1),
  });
  const { calls } = await setup(page, { seed: [planned, passed] });
  await open(page, "/ideas?tab=ai");
  const tile = page.locator("article", { hasText: "Clinician answers" });
  await expect(tile.getByText("Suggested: Thu 31 Dec · TT Video")).toBeVisible();
  // A passed day says so, with no one-click plan.
  const old = page.locator("article", { hasText: "Thanksgiving gratitude" });
  await expect(old.getByText("Suggested: Tue 10 Nov · IG Carousel (passed)")).toBeVisible();
  await expect(old.getByRole("button", { name: /^Plan on/ })).toHaveCount(0);

  if (!isDesktop(page)) await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(tile).toHaveScreenshot(`idea-ai-suggested-${info.project.name}.png`);

  await tile.getByRole("button", { name: "Plan on Thu 31 Dec" }).click();
  await expect(page.getByText("Planned for Thu 31 Dec")).toBeVisible();
  expect(calls.find((c) => c.method === "RPC plan_idea")?.body).toEqual({
    p_idea_id: "i-plan",
    p_date: "2026-12-31",
    p_platform: "tiktok",
    p_format: "video",
    p_title: "Clinician answers: is Dry January worth it?",
  });
  // Planned now: the tile shows the badge instead of the suggestion.
  await expect(tile.getByText("Suggested: Thu 31 Dec · TT Video")).toHaveCount(0);
});

// ───────────────────────────── Select mode: delete many, with Undo

test("ideas — Select mode: tick your own ideas, delete them, Undo brings them back", async ({
  page,
}, info) => {
  const { calls, removed } = await setup(page, { role: "member" });
  await open(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const bar = page.getByRole("toolbar", { name: "Selected ideas" });
  await expect(bar.getByText("Select ideas to delete")).toBeVisible();

  // A member can tick only ideas they added; others' are dimmed and can't be ticked.
  const theirs = page.getByRole("checkbox", { name: /^Can’t delete/ }).first();
  await expect(theirs).toHaveAttribute("aria-disabled", "true");
  const mine = page.getByRole("checkbox", { name: /^Select idea/ });
  const n = await mine.count();
  expect(n).toBeGreaterThanOrEqual(2);
  await mine.nth(0).click();
  await mine.nth(1).click();
  await expect(mine.nth(0)).toHaveAttribute("aria-checked", "true");
  await expect(bar.getByText("2 selected")).toBeVisible();
  await expect(bar.getByRole("button", { name: `Select all you can delete (${n})` })).toBeVisible();
  if (info.project.name === "mobile-390") await tapTargetsOk(page);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot(`ideas-select-${info.project.name}.png`);

  await bar.getByRole("button", { name: "Delete 2 ideas" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete 2 ideas?" });
  await expect(
    confirm.getByText(
      "Their comments go with them. Calendar cards made from them stay. You can undo for a few seconds.",
    ),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Delete 2 ideas" }).click();
  await expect(page.getByText("Deleted 2 ideas")).toBeVisible();
  await expect(bar).toBeHidden(); // back to the normal board
  const del = calls.find((c) => c.method === "RPC delete_ideas")!.body as { p_ids: string[] };
  expect(del.p_ids).toHaveLength(2);

  // Undo: all of them back, and their images are never removed.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Restored 2 ideas")).toBeVisible();
  expect(calls.some((c) => c.method === "RPC restore_ideas")).toBe(true);
  expect(removed).toEqual([]);
});

test("ideas — Select mode: Cancel or Esc leaves it; nothing is deleted", async ({ page }) => {
  const { calls } = await setup(page, { role: "admin" });
  await open(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  // Admins can tick anyone's idea, AI ideas too.
  await expect(page.getByRole("checkbox", { name: /^Can’t delete/ })).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: /^Select idea/ })
    .first()
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar", { name: "Selected ideas" })).toBeHidden();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.getByRole("toolbar").getByText("Select ideas to delete")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("toolbar", { name: "Selected ideas" })).toBeHidden();
  expect(calls.filter((c) => c.method.startsWith("RPC delete"))).toEqual([]);
});

test("ideas — gallery select: a card's checkbox (hover / focus) or a long press enters Select mode (polish)", async ({
  page,
}, info) => {
  await setup(page, { role: "admin" });
  await open(page);
  const bar = page.getByRole("toolbar", { name: "Selected ideas" });
  await expect(bar).toBeHidden();
  const first = page
    .locator("article")
    .filter({ has: page.getByRole("button", { name: /^Open idea/ }) })
    .first();
  if (info.project.name === "mobile-390") {
    // Phones: a long press on a card (no hover there).
    const card = first.getByRole("button", { name: /^Open idea/ });
    await card.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true });
    await page.waitForTimeout(650); // past 500 ms: select mode replaces the card's open button
  } else {
    await first.hover();
    const tick = first.getByRole("checkbox", { name: /^Select idea/ });
    await expect(tick).toBeVisible();
    await tick.click();
  }
  await expect(bar.getByText("1 selected")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Select idea/, checked: true })).toHaveCount(1);
  // The long press didn't also open the idea.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
