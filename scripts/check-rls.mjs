#!/usr/bin/env node
/**
 * Slice 2 check: an ANONYMOUS request (publishable key, no signed-in user) must not be able to
 * read any table, list private buckets, or upload a file.
 *
 *   node --env-file=.env.local scripts/check-rls.mjs
 *
 * Never prints the URL or the key. Makes no Firecrawl calls. Read-only except one upload attempt
 * that must be rejected (if it isn't, the script says which file to delete).
 */

const URL_ = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local");
  process.exit(1);
}

const TABLES = [
  "profiles",
  "clients",
  "competitors",
  "pulls",
  "pull_tasks",
  "posts",
  "ideas",
  "idea_comments",
  "calendar_cards",
  "holiday_cache",
  "usage_meters",
];
const BUCKETS = ["post-thumbs", "idea-images"];

// Publishable keys go in the apikey header only (not Authorization: Bearer).
const headers = { apikey: KEY };
const redact = (text) => String(text).split(KEY).join("[redacted]").split(URL_).join("[project]");

let failures = 0;
function report(ok, label, detail) {
  if (!ok) failures++;
  console.log(
    `${ok === true ? "✓" : ok === "warn" ? "!" : "✗"} ${label.padEnd(34)} ${redact(detail)}`,
  );
}

async function call(method, path, init = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    ...init,
    headers: { ...headers, ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

console.log("Anonymous requests (should all be refused):\n");

for (const table of TABLES) {
  const { status, body } = await call("GET", `/rest/v1/${table}?select=*&limit=1`);
  const code = body?.code ? ` ${body.code}` : "";
  if (status === 401 || status === 403)
    report(true, `table ${table}`, `HTTP ${status}${code} (refused)`);
  else if (status === 200 && Array.isArray(body) && body.length === 0)
    report("warn", `table ${table}`, "HTTP 200 [] — no rows visible, but access wasn't refused");
  else report(false, `table ${table}`, `HTTP ${status} — ${JSON.stringify(body).slice(0, 120)}`);
}

for (const bucket of BUCKETS) {
  const { status, body } = await call("POST", `/storage/v1/object/list/${bucket}`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 1 }),
  });
  const ok = status >= 400 || (status === 200 && Array.isArray(body) && body.length === 0);
  report(
    ok,
    `list bucket ${bucket}`,
    `HTTP ${status}${ok ? " (nothing visible)" : ` — ${JSON.stringify(body).slice(0, 120)}`}`,
  );
}

const probe = `rls-check/anon-${Date.now()}.webp`;
const upload = await call("POST", `/storage/v1/object/idea-images/${probe}`, {
  headers: { "Content-Type": "image/webp" },
  body: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
});
report(
  upload.status >= 400,
  "upload to idea-images",
  upload.status >= 400
    ? `HTTP ${upload.status} (refused)`
    : `HTTP ${upload.status} — UPLOAD WAS ACCEPTED. Delete idea-images/${probe} in the dashboard.`,
);

// Slice 10 + 12 functions: execute is granted to authenticated only. A random id means that even if the
// call were allowed it would only fail with "not found" — nothing is ever written.
const NO_SUCH_ID = "00000000-0000-4000-8000-000000000000";
const RPCS = {
  plan_idea: {
    p_idea_id: NO_SUCH_ID,
    p_date: "2027-01-05",
    p_platform: "instagram",
    p_format: "reel",
    p_title: "rls check",
  },
  card_to_idea: { p_card_id: NO_SUCH_ID },
  delete_idea: { p_idea_id: NO_SUCH_ID },
  restore_idea: { p_snapshot: { idea: { id: NO_SUCH_ID }, comments: [] } },
  // Slice 12 (Settings): read-only, or acting on a person who doesn't exist.
  team_members: {},
  usage_sizes: {},
  set_member_role: { p_user: NO_SUCH_ID, p_role: "member" },
  set_member_access: { p_user: NO_SUCH_ID, p_active: true },
  delete_ideas: { p_ids: [NO_SUCH_ID] },
  restore_ideas: { p_snapshots: [] },
  delete_all_ideas: { p_client: NO_SUCH_ID, p_expected: -1 }, // -1 never matches: nothing deleted
};
for (const [fn, args] of Object.entries(RPCS)) {
  const { status, body } = await call("POST", `/rest/v1/rpc/${fn}`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const refused = (status === 401 || status === 403) && body?.code === "42501";
  report(
    refused,
    `function ${fn}`,
    refused
      ? `HTTP ${status} 42501 (refused)`
      : `HTTP ${status} — ${JSON.stringify(body).slice(0, 120)}`,
  );
}

console.log(
  failures ? `\n✗ ${failures} check(s) failed.` : "\n✓ Anonymous access is blocked everywhere.",
);
process.exit(failures ? 1 : 0);
