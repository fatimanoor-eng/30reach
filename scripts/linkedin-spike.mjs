#!/usr/bin/env node
/**
 * LinkedIn data spike (23 Nov 2026) — company page posts via Firecrawl Alexandria.
 * Results: docs/INTEGRATIONS.md → "LinkedIn spike".
 *
 * Runs ONE step per command, so every paid call is a deliberate choice:
 *
 *   node --env-file=.env.local scripts/linkedin-spike.mjs credits     # balance                          (0 credits)
 *   node --env-file=.env.local scripts/linkedin-spike.mjs sc-page1    # ScrapeCreators company posts p1  (1 credit)
 *   node --env-file=.env.local scripts/linkedin-spike.mjs hv-page1    # HarvestAPI company posts p1      (1 credit)
 *   node --env-file=.env.local scripts/linkedin-spike.mjs sc-post     # ScrapeCreators one post details  (1 credit)
 *   node --env-file=.env.local scripts/linkedin-spike.mjs hv-page2    # HarvestAPI page 2 (needs hv-page1) (1 credit, even if empty)
 *   node --env-file=.env.local scripts/linkedin-spike.mjs sc-missing  # made-up page, ScrapeCreators     (0 credits)
 *   node --env-file=.env.local scripts/linkedin-spike.mjs hv-missing  # made-up page, HarvestAPI         (0 credits)
 *
 * Safety:
 * - The API key is read from the environment and only ever placed in the Authorization header.
 *   Everything printed or saved goes through redact() first.
 * - Paid steps refuse to run twice (a saved result in .spike/ blocks a re-run) unless you pass --again.
 * - Raw responses are saved to .spike/ (gitignored) so fields can be studied without spending credits again.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.firecrawl.dev/v2";
const OUT_DIR = ".spike";
const PAGE_URL = "https://www.linkedin.com/company/hims-&-hers/";
const MISSING_URL = "https://www.linkedin.com/company/zz30reach-nosuchco-7q/";
const POST_URL =
  "https://www.linkedin.com/posts/hims-%26-hers_hers-launches-free-metabolic-deep-dive-to-activity-7529164327652880385-wfJ5";

const KEY = process.env.FIRECRAWL_API_KEY;
if (!KEY) {
  console.error(
    "FIRECRAWL_API_KEY is not set. Run with: node --env-file=.env.local scripts/linkedin-spike.mjs <step>",
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

const short = (value, n = 160) => {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
};

function save(step, data) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(
    OUT_DIR,
    `linkedin-${step}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(file, redact(JSON.stringify(data, null, 2)));
  log(`Saved raw response → ${file}`);
}

function latestSaved(step) {
  try {
    const files = readdirSync(OUT_DIR)
      .filter((f) => f.startsWith(`linkedin-${step}-`))
      .sort();
    return files.length ? join(OUT_DIR, files.at(-1)) : null;
  } catch {
    return null;
  }
}

async function firecrawl(method, path, body) {
  const started = Date.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { nonJsonBody: text.slice(0, 2000) };
  }
  return { status: res.status, json, ms: Date.now() - started };
}

// ---------------------------------------------------------------- steps

async function credits() {
  const { status, json } = await firecrawl("GET", "/team/credit-usage");
  if (status !== 200) return log(`HTTP ${status}`, json.error ?? json);
  const d = json.data ?? {};
  log(`Remaining: ${d.remainingCredits} / plan ${d.planCredits}`);
}

async function call(step, provider, capability, options) {
  log(`Calling ${provider}/${capability} with ${JSON.stringify(options)}`);
  const { status, json, ms } = await firecrawl("POST", "/scrape", {
    alexandria: { provider, capability, options },
  });
  save(step, { request: { provider, capability, options }, status, ms, json });

  const result = json.data?.alexandria?.[0] ?? {};
  log(
    `HTTP ${status}  success=${json.success}  ${ms} ms  creditsCost=${json.data?.creditsCost ?? "?"}`,
  );
  // Errors come back with HTTP 200 and success: true — always check the per-call error.
  if (result.error) log("Error:", result.error);
  if (result.requiresAction) log("Requires action (terms?):", result.requiresAction);

  const data = result.data ?? {};
  if (data.pagination) log("pagination:", data.pagination);
  const list = Array.isArray(data.posts)
    ? data.posts
    : Array.isArray(data.elements)
      ? data.elements
      : null;
  if (!list) {
    if (Object.keys(data).length) log("Fields:", Object.keys(data).sort());
    if (data.likeCount !== undefined)
      log(`likeCount=${data.likeCount} commentCount=${data.commentCount}`);
    return;
  }
  log(`Posts on this page: ${list.length}`);
  const keys = new Set();
  list.forEach((p) => Object.keys(p ?? {}).forEach((k) => keys.add(k)));
  log("Fields across posts:", [...keys].sort());
  for (const p of list) {
    const date = p.datePublished ?? p.postedAt?.date ?? "?";
    const e = p.engagement;
    const counts = e ? ` | likes ${e.likes} comments ${e.comments} shares ${e.shares}` : "";
    const repost = p.repostedBy ? " | REPOST" : "";
    log(`  ${date.slice(0, 10)} ${short(p.text ?? p.content, 60)}${counts}${repost}`);
  }
}

function hvPage2() {
  const file = latestSaved("hv-page1");
  if (!file) throw new Error("Run hv-page1 first (page 2 needs its paginationToken).");
  const token = JSON.parse(readFileSync(file, "utf8")).json?.data?.alexandria?.[0]?.data?.pagination
    ?.paginationToken;
  return call("hv-page2", "harvestapi", "linkedin/company-posts", {
    company: PAGE_URL,
    page: 2,
    paginationToken: token,
  });
}

// ---------------------------------------------------------------- main

const STEPS = {
  credits: { paid: false, run: credits },
  "sc-page1": {
    paid: true,
    run: () => call("sc-page1", "scrapecreators", "linkedin/company-posts", { url: PAGE_URL }),
  },
  "hv-page1": {
    paid: true,
    run: () => call("hv-page1", "harvestapi", "linkedin/company-posts", { company: PAGE_URL }),
  },
  "sc-post": {
    paid: true,
    run: () => call("sc-post", "scrapecreators", "linkedin/post", { url: POST_URL }),
  },
  "hv-page2": { paid: true, run: hvPage2 },
  "sc-missing": {
    paid: true,
    run: () => call("sc-missing", "scrapecreators", "linkedin/company-posts", { url: MISSING_URL }),
  },
  "hv-missing": {
    paid: true,
    run: () => call("hv-missing", "harvestapi", "linkedin/company-posts", { company: MISSING_URL }),
  },
};

const [stepName, flag] = process.argv.slice(2);
const step = STEPS[stepName];
if (!step) {
  console.error(`Usage: scripts/linkedin-spike.mjs <${Object.keys(STEPS).join(" | ")}> [--again]`);
  process.exit(1);
}
if (step.paid && flag !== "--again" && latestSaved(stepName)) {
  console.error(
    `"${stepName}" already ran (${latestSaved(stepName)}). Pass --again to spend credits again.`,
  );
  process.exit(1);
}
await step.run();
