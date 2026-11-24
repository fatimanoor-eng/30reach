#!/usr/bin/env node
/**
 * Slice 17d check: scan-site and suggest-competitors (team only, they spend credits) must refuse callers who aren't signed in.
 *
 *   node --env-file=.env.local scripts/check-scan-fns.mjs
 *
 * Publishable key only, no session → expects 401. Every body is invalid on purpose (no URL, no
 * name), so even if the auth locks were broken the functions would stop at validation (400) before
 * spending any credits. Never prints the URL or key.
 */
const URL_ = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local");
  process.exit(1);
}

const FUNCTIONS = ["scan-site", "suggest-competitors"];
const cases = [
  ["no token (publishable key only)", { apikey: KEY }],
  ["garbage bearer token", { apikey: KEY, Authorization: "Bearer not-a-real-jwt" }],
];

let failures = 0;
for (const fn of FUNCTIONS) {
  for (const [label, headers] of cases) {
    const res = await fetch(`${URL_}/functions/v1/${fn}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "", name: "" }),
      signal: AbortSignal.timeout(20_000),
    });
    await res.body?.cancel();
    if (res.status === 404) {
      failures++;
      console.log(`✗ ${fn.padEnd(20)} isn't deployed yet (HTTP 404).`);
      break;
    }
    const ok = res.status === 401 || res.status === 403;
    if (!ok) failures++;
    console.log(
      `${ok ? "✓" : "✗"} ${fn.padEnd(20)} ${label.padEnd(34)} HTTP ${res.status}${ok ? " (refused)" : ""}`,
    );
  }
}
console.log(
  failures
    ? `\n✗ ${failures} problem(s).`
    : "\n✓ scan-site and suggest-competitors refuse callers who aren't signed in.",
);
process.exit(failures ? 1 : 0);
