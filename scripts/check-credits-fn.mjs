#!/usr/bin/env node
/**
 * Slice 4 check: the `credits` Edge Function must refuse callers who aren't signed in.
 *
 *   node --env-file=.env.local scripts/check-credits-fn.mjs
 *
 * Sends two requests with the publishable key only (no user session) and expects 401 for both.
 * A refused call never reaches Firecrawl, so this costs 0 credits. Never prints the URL or key.
 */

const URL_ = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local");
  process.exit(1);
}

const endpoint = `${URL_}/functions/v1/credits`;
const cases = [
  ["no token (publishable key only)", { apikey: KEY }],
  ["garbage bearer token", { apikey: KEY, Authorization: "Bearer not-a-real-jwt" }],
];

let failures = 0;
for (const [label, headers] of cases) {
  const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(20_000) });
  const body = await res.text();
  const ok = res.status === 401 || res.status === 403;
  if (!ok) failures++;
  const leaked = /remaining|plan/.test(body) ? " — RESPONSE CONTAINS CREDIT DATA" : "";
  console.log(
    `${ok ? "✓" : "✗"} ${label.padEnd(34)} HTTP ${res.status}${ok ? " (refused)" : leaked}`,
  );
}

console.log(
  failures
    ? `\n✗ ${failures} check(s) failed.`
    : "\n✓ The credits function refuses callers who aren't signed in.",
);
process.exit(failures ? 1 : 0);
