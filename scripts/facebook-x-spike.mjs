#!/usr/bin/env node
/**
 * Facebook + X data spike (24 Nov 2026) — page / profile posts via Firecrawl Alexandria.
 * Results: docs/INTEGRATIONS.md → "Facebook / X spike".
 *
 * Runs ONE step per command, so every paid call is a deliberate choice:
 *
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs credits      # balance                                  (0)
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs fb-posts     # ScrapeCreators facebook/profile-posts p1 (1)
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs fb-posts-p2  # same, page 2 via cursor (needs fb-posts)  (1)
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs fb-reels     # ScrapeCreators facebook/profile-reels p1 (1)
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs fb-post      # ScrapeCreators facebook/post (1st post)   (1)
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs fb-profile   # AnyAPI facebook/profile (followers)       (5)
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs fb-missing   # made-up page, ScrapeCreators              (0 expected)
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs x-posts      # ScrapeCreators x/user-posts               (1)
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs x-post       # ScrapeCreators x/post (1st tweet)         (1)
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs x-search     # AnyAPI twitter/search "from:<handle>"     (5)
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs x-missing    # made-up handle, ScrapeCreators            (measured: 1!)
 *   node --env-file=.env.local scripts/facebook-x-spike.mjs x-search-many --handles=ro,joinfound,LifeMD
 *                                                                        # AnyAPI, several brands in ONE search,
 *                                                                        # original posts only                       (5)
 *
 * Another brand: add --fb=<page url> or --x=<handle> (e.g. when WeightWatchers barely posts somewhere).
 * What was actually run (24 Nov 2026, 27 credits): every step above except x-post; x-posts and x-search
 * once more with --x=hims --again. See INTEGRATIONS.md for the results.
 * Numbers in brackets are the team's catalogue price in Firecrawl credits; the real cost is logged.
 *
 * Safety:
 * - The API key is read from the environment and only ever placed in the Authorization header.
 *   Everything printed or saved goes through redact() first.
 * - Paid steps refuse to run twice (a saved result in .spike/ blocks a re-run) unless you pass --again.
 * - Raw responses are saved to .spike/ (gitignored); every call's creditsCost is appended to
 *   .spike/fbx-costs.log so the total can be checked against the balance.
 */

import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.firecrawl.dev/v2";
const OUT_DIR = ".spike";

const args = process.argv.slice(2);
const flag = (name) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
const FB_URL = flag("fb") ?? "https://www.facebook.com/weightwatchers";
const X_HANDLE = (flag("x") ?? "ww_us").replace(/^@/, "");
const FB_MISSING = "https://www.facebook.com/zz30reachnosuchpage7q";
const X_MISSING = "zz30reach_nosuch7q";

const KEY = process.env.FIRECRAWL_API_KEY;
if (!KEY) {
  console.error(
    "FIRECRAWL_API_KEY is not set. Run with: node --env-file=.env.local scripts/facebook-x-spike.mjs <step>",
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

const short = (value, n = 70) => {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
};

function save(step, data) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `fbx-${step}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, redact(JSON.stringify(data, null, 2)));
  log(`Saved raw response → ${file}`);
}

function latestSaved(step) {
  try {
    const files = readdirSync(OUT_DIR)
      .filter((f) => f.startsWith(`fbx-${step}-`))
      .sort();
    return files.length ? join(OUT_DIR, files.at(-1)) : null;
  } catch {
    return null;
  }
}

function savedResult(step) {
  const file = latestSaved(step);
  if (!file) throw new Error(`Run ${step} first.`);
  return JSON.parse(readFileSync(file, "utf8")).json?.data?.alexandria?.[0] ?? {};
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

/** Best-guess one-line summary of a post from any of the providers. */
function line(p) {
  const legacy = p.legacy ?? {};
  const unix = p.publishTime ?? p.createdUtc ?? p.creation_time ?? null;
  const date =
    (typeof unix === "number" ? new Date(unix * 1000).toISOString() : unix) ??
    legacy.created_at ??
    p.createdAt ??
    p.created_at ??
    "?";
  const text = p.text ?? p.description ?? legacy.full_text ?? p.content ?? "";
  const counts = [
    ["react", p.reactionCount ?? p.like_count ?? legacy.favorite_count ?? p.likeCount],
    ["comm", p.commentCount ?? p.comment_count ?? legacy.reply_count ?? p.replyCount],
    ["by", p.authorUsername],
    ["reply", p.isReply || undefined],
    ["share", p.share_count ?? legacy.retweet_count ?? p.retweetCount],
    ["views", p.view_count ?? p.views?.count ?? p.viewCount],
  ]
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k} ${v}`)
    .join(" ");
  return `  ${String(date).slice(0, 25)} | ${short(text)} | ${counts}`;
}

async function call(step, provider, capability, options) {
  log(`Calling ${provider}/${capability} with ${JSON.stringify(options)}`);
  const { status, json, ms } = await firecrawl("POST", "/scrape", {
    alexandria: { provider, capability, options },
  });
  save(step, { request: { provider, capability, options }, status, ms, json });

  const result = json.data?.alexandria?.[0] ?? {};
  const cost = json.data?.creditsCost ?? "?";
  log(`HTTP ${status}  success=${json.success}  ${ms} ms  creditsCost=${cost}`);
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(
    join(OUT_DIR, "fbx-costs.log"),
    `${new Date().toISOString()}\t${step}\t${provider}/${capability}\tcreditsCost=${cost}\n`,
  );
  // Errors come back with HTTP 200 and success: true — always check the per-call error.
  if (result.error) log("Error:", result.error);
  if (result.requiresAction) log("Requires action (terms?):", result.requiresAction);

  const data = result.data ?? {};
  const top = Object.keys(data).sort();
  if (top.length) log("Top-level fields:", top);
  const list = [
    data.posts,
    data.reels,
    data.tweets,
    data.output?.data?.items,
    data.output?.data,
  ].find(Array.isArray);
  if (!list) return;
  log(`Items on this page: ${list.length}`);
  const keys = new Set();
  list.forEach((p) => Object.keys(p ?? {}).forEach((k) => keys.add(k)));
  log("Fields across items:", [...keys].sort());
  list.forEach((p) => log(line(p)));
}

function fbPostsPage2() {
  const cursor = savedResult("fb-posts").data?.cursor;
  if (!cursor) throw new Error("fb-posts returned no cursor.");
  return call("fb-posts-p2", "scrapecreators", "facebook/profile-posts", { url: FB_URL, cursor });
}

function fbOnePost() {
  const first = savedResult("fb-posts").data?.posts?.[0];
  const url = first?.url ?? first?.permalink;
  if (!url) throw new Error("fb-posts returned no post URL.");
  return call("fb-post", "scrapecreators", "facebook/post", { url });
}

function xOnePost() {
  const first = savedResult("x-posts").data?.tweets?.[0];
  const url = first?.url ?? (first?.rest_id && `https://x.com/${X_HANDLE}/status/${first.rest_id}`);
  if (!url) throw new Error("x-posts returned no tweet.");
  return call("x-post", "scrapecreators", "x/post", { url });
}

// ---------------------------------------------------------------- main

const STEPS = {
  credits: { paid: false, run: credits },
  "fb-posts": {
    paid: true,
    run: () => call("fb-posts", "scrapecreators", "facebook/profile-posts", { url: FB_URL }),
  },
  "fb-posts-p2": { paid: true, run: fbPostsPage2 },
  "fb-reels": {
    paid: true,
    run: () => call("fb-reels", "scrapecreators", "facebook/profile-reels", { url: FB_URL }),
  },
  "fb-post": { paid: true, run: fbOnePost },
  "fb-profile": {
    paid: true,
    run: () => call("fb-profile", "anyapi", "facebook/profile", { url: FB_URL }),
  },
  "fb-missing": {
    paid: true,
    run: () => call("fb-missing", "scrapecreators", "facebook/profile-posts", { url: FB_MISSING }),
  },
  "x-posts": {
    paid: true,
    run: () => call("x-posts", "scrapecreators", "x/user-posts", { handle: X_HANDLE }),
  },
  "x-post": { paid: true, run: xOnePost },
  "x-search": {
    paid: true,
    run: () =>
      call("x-search", "anyapi", "twitter/search", {
        query: `from:${X_HANDLE}`,
        queryType: "Latest",
      }),
  },
  "x-search-many": {
    paid: true,
    run: () => {
      const handles = (flag("handles") ?? "ro,joinfound,LifeMD").split(",").map((h) => h.trim());
      return call("x-search-many", "anyapi", "twitter/search", {
        query: `(${handles.map((h) => `from:${h.replace(/^@/, "")}`).join(" OR ")}) -filter:replies`,
        queryType: "Latest",
      });
    },
  },
  "x-missing": {
    paid: true,
    run: () => call("x-missing", "scrapecreators", "x/user-posts", { handle: X_MISSING }),
  },
};

const stepName = args.find((a) => !a.startsWith("--"));
const step = STEPS[stepName];
if (!step) {
  console.error(
    `Usage: scripts/facebook-x-spike.mjs <${Object.keys(STEPS).join(" | ")}> [--fb=<url>] [--x=<handle>] [--again]`,
  );
  process.exit(1);
}
if (step.paid && !args.includes("--again") && latestSaved(stepName)) {
  console.error(
    `"${stepName}" already ran (${latestSaved(stepName)}). Pass --again to spend credits again.`,
  );
  process.exit(1);
}
await step.run();
