#!/usr/bin/env node
/**
 * Slice 1 — Firecrawl data spike (ScrapeCreators provider only).
 *
 * Runs ONE step per command, so every paid call is a deliberate choice:
 *
 *   node --env-file=.env.local scripts/firecrawl-spike.mjs credits     # balance          (expected 0 credits)
 *   node --env-file=.env.local scripts/firecrawl-spike.mjs instagram   # @hims, 1 page     (expected 2 credits)
 *   node --env-file=.env.local scripts/firecrawl-spike.mjs tiktok      # @hims, 1 page     (expected 2 credits)
 *   node --env-file=.env.local scripts/firecrawl-spike.mjs missing     # fake IG handle    (expected 0–2 credits)
 *   node --env-file=.env.local scripts/firecrawl-spike.mjs thumb       # thumbnail check   (no Firecrawl call)
 *
 * Safety:
 * - The API key is read from the environment and only ever placed in the Authorization header.
 *   Everything printed or saved goes through redact() first.
 * - Paid steps refuse to run twice (a saved result in .spike/ blocks a re-run) unless you pass --again.
 * - Never follows pagination: exactly one page per platform.
 * - Raw responses are saved to .spike/ (gitignored) so we can study fields without spending credits again.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.firecrawl.dev/v2";
const PROVIDER = "scrapecreators"; // the only provider this spike may call
const OUT_DIR = ".spike";
const HANDLE = "hims";
const MISSING_HANDLE = "zz30reach_nosuchuser_7q"; // valid IG format, should not exist

const KEY = process.env.FIRECRAWL_API_KEY;
if (!KEY) {
  console.error(
    "FIRECRAWL_API_KEY is not set. Run with: node --env-file=.env.local scripts/firecrawl-spike.mjs <step>",
  );
  process.exit(1);
}

/** Remove the key from any text before it is printed or written to disk. */
function redact(text) {
  return String(text).split(KEY).join("[redacted]");
}

function log(...parts) {
  console.log(
    redact(parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p, null, 2))).join(" ")),
  );
}

function save(step, data) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${step}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, redact(JSON.stringify(data, null, 2)));
  log(`Saved raw response → ${file}`);
  return file;
}

function latestSaved(step) {
  try {
    const files = readdirSync(OUT_DIR)
      .filter((f) => f.startsWith(`${step}-`))
      .sort();
    return files.length ? join(OUT_DIR, files.at(-1)) : null;
  } catch {
    return null;
  }
}

async function firecrawl(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { nonJsonBody: text.slice(0, 2000) };
  }
  return { status: res.status, json };
}

/** Depth-first search for the first value stored under `key` anywhere in `obj`. */
function findKey(obj, key, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 8) return undefined;
  if (Object.hasOwn(obj, key)) return obj[key];
  for (const value of Object.values(obj)) {
    const found = findKey(value, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function toDate(seconds) {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString().slice(0, 10) : "?";
}

// ---------------------------------------------------------------- steps

async function credits() {
  const { status, json } = await firecrawl("GET", "/team/credit-usage");
  save("credits", { status, json });
  if (status !== 200) return log(`HTTP ${status}`, json.error ?? json);
  const d = json.data ?? {};
  log(
    `Remaining: ${d.remainingCredits} / plan ${d.planCredits}  (period ${d.billingPeriodStart} → ${d.billingPeriodEnd})`,
  );
}

async function scrape(step, capability, options, listKey, dateKey) {
  log(`Calling ${PROVIDER}/${capability} with ${JSON.stringify(options)} — one page only.`);
  const { status, json } = await firecrawl("POST", "/scrape", {
    alexandria: { provider: PROVIDER, capability, options },
  });
  save(step, { request: { provider: PROVIDER, capability, options }, status, json });

  log(`HTTP ${status}  success=${json.success}`);
  log(`Firecrawl creditsCost: request=${findKey(json, "creditsCost") ?? "?"}`);

  // Only look at Firecrawl's wrapper (top level + each data.alexandria[] item), never inside
  // the posts — Instagram posts have their own `code` field (the shortcode).
  const wrappers = [json, ...(Array.isArray(json.data?.alexandria) ? json.data.alexandria : [])];
  const pick = (k) => wrappers.map((w) => w?.[k]).find((v) => v != null);
  const requiresAction = pick("requiresAction");
  const error = pick("error");
  const code = pick("code");
  if (requiresAction || error || code) {
    log("Error / action needed:", { error, code, requiresAction });
  }

  const charged = findKey(json, "credits_charged");
  if (charged !== undefined) log(`ScrapeCreators credits_charged: ${charged}`);

  const list = findKey(json, listKey);
  if (!Array.isArray(list)) {
    log(`No "${listKey}" array found. Top-level keys:`, Object.keys(json.data ?? json));
    return;
  }

  const dates = list
    .map((item) => item?.[dateKey])
    .filter((n) => typeof n === "number")
    .sort((a, b) => a - b);
  log(`Posts on this page: ${list.length}`);
  log(`Date range: ${toDate(dates[0])} → ${toDate(dates.at(-1))}`);
  for (const k of ["more_available", "has_more", "next_max_id", "max_cursor", "num_results"]) {
    const v = findKey(json, k);
    if (v !== undefined)
      log(`${k}: ${typeof v === "string" && v.length > 24 ? `${v.slice(0, 24)}…` : v}`);
  }
  log("Fields on the first post:", Object.keys(list[0] ?? {}).sort());
}

async function thumb() {
  for (const [step, listKey] of [
    ["instagram", "items"],
    ["tiktok", "aweme_list"],
  ]) {
    const file = latestSaved(step);
    if (!file) {
      log(`${step}: no saved result yet, skipping.`);
      continue;
    }
    const list = findKey(JSON.parse(readFileSync(file, "utf8")), listKey) ?? [];
    const first = list[0] ?? {};
    const url =
      first.display_uri ??
      first.image_versions2?.candidates?.[0]?.url ??
      first.video?.cover?.url_list?.[0] ??
      first.video?.origin_cover?.url_list?.[0];
    if (!url) {
      log(`${step}: no thumbnail URL found on the first post.`);
      continue;
    }
    const expiresHex =
      new URL(url).searchParams.get("oe") ?? new URL(url).searchParams.get("x-expires");
    const expires = expiresHex
      ? new Date(
          (/^[0-9a-f]+$/i.test(expiresHex) && expiresHex.length === 8
            ? parseInt(expiresHex, 16)
            : Number(expiresHex)) * 1000,
        ).toISOString()
      : "no expiry parameter";
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const bytes = (await res.arrayBuffer()).byteLength;
    log(
      `${step}: HTTP ${res.status}  ${res.headers.get("content-type")}  ${Math.round(bytes / 1024)} KB  link expires: ${expires}`,
    );
  }
}

// ---------------------------------------------------------------- main

const STEPS = {
  credits: { paid: false, run: credits },
  instagram: {
    paid: true,
    run: () => scrape("instagram", "instagram/user-posts", { handle: HANDLE }, "items", "taken_at"),
  },
  tiktok: {
    paid: true,
    run: () =>
      scrape(
        "tiktok",
        "tiktok/user-videos",
        { handle: HANDLE, sort_by: "latest", region: "US" },
        "aweme_list",
        "create_time",
      ),
  },
  missing: {
    paid: true,
    run: () =>
      scrape("missing", "instagram/user-posts", { handle: MISSING_HANDLE }, "items", "taken_at"),
  },
  thumb: { paid: false, run: thumb },
};

const [stepName, flag] = process.argv.slice(2);
const step = STEPS[stepName];
if (!step) {
  console.error(
    `Usage: node --env-file=.env.local scripts/firecrawl-spike.mjs <${Object.keys(STEPS).join("|")}> [--again]`,
  );
  process.exit(1);
}
if (step.paid && latestSaved(stepName) && flag !== "--again") {
  console.error(
    `"${stepName}" already ran (see ${latestSaved(stepName)}). Pass --again to spend credits on it again.`,
  );
  process.exit(1);
}

try {
  await step.run();
} catch (err) {
  console.error(redact(`Failed: ${err?.name ?? "Error"}: ${err?.message ?? err}`));
  process.exit(1);
}
