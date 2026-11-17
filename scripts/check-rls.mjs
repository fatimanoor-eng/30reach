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

console.log(
  failures ? `\n✗ ${failures} check(s) failed.` : "\n✓ Anonymous access is blocked everywhere.",
);
process.exit(failures ? 1 : 0);
