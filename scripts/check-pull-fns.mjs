#!/usr/bin/env node
/**
 * Slice 5 check: pull-start, pull-task and pull-finish must refuse callers who aren't signed in.
 *
 *   node --env-file=.env.local scripts/check-pull-fns.mjs
 *
 * Publishable key only, no session → expects 401 from each. Refused calls never reach Firecrawl,
 * so this costs 0 credits. Never prints the URL or key.
 */
const URL_ = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local");
  process.exit(1);
}

let failures = 0;
for (const fn of ["pull-start", "pull-task", "pull-finish"]) {
  const res = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "x", taskId: "x", pullId: "x", preview: true }),
    signal: AbortSignal.timeout(20_000),
  });
  const ok = res.status === 401 || res.status === 403;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${fn.padEnd(12)} HTTP ${res.status}${ok ? " (refused)" : ""}`);
}
console.log(
  failures
    ? `\n✗ ${failures} function(s) did not refuse.`
    : "\n✓ All pull functions refuse callers who aren't signed in.",
);
process.exit(failures ? 1 : 0);
