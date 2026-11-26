import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "./server.ts";

// server.ts re-exports an `npm:` module (Deno only); the loaders below only need its types.
vi.mock("./server.ts", () => ({ clientName: vi.fn(), json: vi.fn(), recordUsage: vi.fn() }));
const { insightResponse, loadClientContext, loadPull } = await import("./ai-server.ts");

/*
 * Every AI function (Ask Blip, Plan {month}, hooks, captions, claim checks) reads the client's data only
 * through loadPull / loadClientContext. These tests use a fake database holding TWO clients and check
 * that only the asked-for client's pull, posts, brands and brief come back, and every query is scoped.
 */

type Filter = [op: "eq" | "in", column: string, value: unknown];
type Query = { table: string; filters: Filter[] };

const ROWS: Record<string, Record<string, unknown>[]> = {
  clients: [
    { id: "client-1", name: "OBU Health", description: "Weight care", industry: "Telehealth" },
    { id: "client-2", name: "All The Best Co", description: "Gift boxes", industry: "Gifting" },
  ],
  pulls: [
    {
      id: "pull-obu-2",
      client_id: "client-1",
      started_at: "2026-11-20T10:00:00Z",
      is_test: false,
      status: "done",
    },
    {
      id: "pull-obu-1",
      client_id: "client-1",
      started_at: "2026-11-10T10:00:00Z",
      is_test: false,
      status: "done",
    },
    {
      id: "pull-atb-2",
      client_id: "client-2",
      started_at: "2026-11-18T10:00:00Z",
      is_test: false,
      status: "done",
    },
    {
      id: "pull-atb-1",
      client_id: "client-2",
      started_at: "2026-11-08T10:00:00Z",
      is_test: false,
      status: "done",
    },
  ],
  competitors: [
    { id: "c-hims", client_id: "client-1", name: "Hims" },
    { id: "c-vine", client_id: "client-2", name: "Carnaby & Vine" },
  ],
  posts: [
    {
      id: "p-obu",
      pull_id: "pull-obu-2",
      competitor_id: "c-hims",
      platform: "instagram",
      hidden: false,
    },
    {
      id: "p-obu-old",
      pull_id: "pull-obu-1",
      competitor_id: "c-hims",
      platform: "instagram",
      hidden: false,
    },
    {
      id: "p-atb",
      pull_id: "pull-atb-2",
      competitor_id: "c-vine",
      platform: "instagram",
      hidden: false,
    },
    {
      id: "p-atb-old",
      pull_id: "pull-atb-1",
      competitor_id: "c-vine",
      platform: "tiktok",
      hidden: false,
    },
  ],
  pull_tasks: [
    { pull_id: "pull-obu-2", competitor_id: "c-hims", platform: "instagram", followers: 10 },
    { pull_id: "pull-atb-2", competitor_id: "c-vine", platform: "instagram", followers: 20 },
  ],
};

/** A tiny stand-in for the Supabase query builder: applies eq / in / order / limit and records them. */
function fakeDb() {
  const queries: Query[] = [];
  const from = (table: string) => {
    const q: Query = { table, filters: [] };
    queries.push(q);
    let order: string | null = null;
    let limit = Infinity;
    const rows = () => {
      let r = (ROWS[table] ?? []).filter((row) =>
        q.filters.every(([op, col, v]) =>
          op === "eq" ? row[col] === v : (v as unknown[]).includes(row[col]),
        ),
      );
      if (order) r = [...r].sort((a, b) => String(b[order!]).localeCompare(String(a[order!])));
      return r.slice(0, limit);
    };
    const builder = {
      select: () => builder,
      eq: (col: string, v: unknown) => (q.filters.push(["eq", col, v]), builder),
      in: (col: string, v: unknown[]) => (q.filters.push(["in", col, v]), builder),
      order: (col: string) => ((order = col), builder),
      limit: (n: number) => ((limit = n), builder),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(ok, fail),
    };
    return builder;
  };
  return { db: { from } as unknown as SupabaseClient, queries };
}

const has = (q: Query, column: string, value: unknown) =>
  q.filters.some(([, c, v]) => c === column && v === value);
/** An `in` filter whose values are all allowed (both pulls' follower readings in one query, round 1). */
const hasOnly = (q: Query, column: string, allowed: unknown[]) =>
  q.filters.some(
    ([op, c, v]) =>
      op === "in" &&
      c === column &&
      Array.isArray(v) &&
      v.length > 0 &&
      v.every((x) => allowed.includes(x)),
  );

describe("AI data is the current client's only", () => {
  it("loadPull reads only that client's pull, posts, brands and followers", async () => {
    const { db, queries } = fakeDb();
    const loaded = await loadPull(db, "client-2", { previous: true });
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.data.clientName).toBe("All The Best Co");
    expect(loaded.data.pull.id).toBe("pull-atb-2");
    expect(loaded.data.previous?.id).toBe("pull-atb-1");
    expect(loaded.data.brands.map((b) => b.name)).toEqual(["Carnaby & Vine"]);
    expect(loaded.data.posts.map((p) => p.id)).toEqual(["p-atb"]);
    expect(loaded.data.previous?.posts.map((p) => p.id)).toEqual(["p-atb-old"]);
    expect(loaded.data.followers.map((f) => f.competitor_id)).toEqual(["c-vine"]);

    // Every query is scoped: by the client, or by a pull that belongs to it.
    for (const q of queries) {
      if (q.table === "clients") expect(has(q, "id", "client-2")).toBe(true);
      else if (q.table === "pulls" || q.table === "competitors")
        expect(has(q, "client_id", "client-2")).toBe(true);
      else if (q.table === "posts" || q.table === "pull_tasks")
        expect(
          has(q, "pull_id", "pull-atb-2") ||
            has(q, "pull_id", "pull-atb-1") ||
            hasOnly(q, "pull_id", ["pull-atb-2", "pull-atb-1"]),
        ).toBe(true);
      else throw new Error(`unexpected table ${q.table}`);
    }
  });

  it("the other client gets its own data, never this one's", async () => {
    const { db } = fakeDb();
    const loaded = await loadPull(db, "client-1", { previous: false });
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.data.posts.map((p) => p.id)).toEqual(["p-obu"]);
    expect(loaded.data.brands.map((b) => b.name)).toEqual(["Hims"]);
    expect(JSON.stringify(loaded.data)).not.toMatch(/atb|vine|All The Best/i);
  });

  it("a client with no pull yet doesn't fall back to another client's", async () => {
    const { db } = fakeDb();
    const saved = ROWS.pulls;
    ROWS.pulls = saved.filter((p) => p.client_id !== "client-2");
    try {
      expect(await loadPull(db, "client-2", { previous: false })).toMatchObject({
        ok: false,
        error: "no_pull",
      });
    } finally {
      ROWS.pulls = saved;
    }
  });

  it("loadClientContext reads that client's brief only", async () => {
    const { db, queries } = fakeDb();
    const ctx = await loadClientContext(db, "client-2");
    expect(ctx).toMatchObject({ name: "All The Best Co", industry: "Gifting" });
    expect(queries).toHaveLength(1);
    expect(has(queries[0], "id", "client-2")).toBe(true);
    expect(await loadClientContext(db, "client-9")).toBeNull();
  });
});

describe("insightResponse (what the browser gets)", () => {
  it("carries every field the panel uses, including follow-ups", () => {
    const r = insightResponse(
      {
        type: "insight",
        lead: "Reels lead",
        points: ["2× likes"],
        forClient: "For OBU Health: try a reel",
        postIds: ["p-1", "missing"],
        inData: true,
        followUps: ["Who grew fastest?"],
      },
      {
        data: {
          brands: [{ id: "c-1", name: "Hims" }],
          pull: { id: "pull-1", started_at: "2026-11-16T10:00:00Z" },
        },
        posts: new Map([
          [
            "p-1",
            {
              id: "p-1",
              competitor_id: "c-1",
              platform: "instagram",
              format: "reel",
              posted_at: "2026-11-10T10:00:00Z",
              url: "https://example.com/p",
              likes: 10,
              comments: 1,
              views: null,
            } as never,
          ],
        ]),
      },
      "OBU Health",
    );
    expect(Object.keys(r).sort()).toEqual(
      [
        "followUps",
        "forClient",
        "idea",
        "inData",
        "lead",
        "points",
        "pull",
        "sources",
        "type",
      ].sort(),
    );
    expect(r.followUps).toEqual(["Who grew fastest?"]);
    expect(r.idea).toBe("Try a reel");
    expect(r.sources).toHaveLength(1);
  });
});
