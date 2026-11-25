#!/usr/bin/env node
/**
 * YouTube data spike (25 Nov 2026) — a channel's videos and Shorts via Firecrawl Alexandria.
 * Results: docs/INTEGRATIONS.md → "YouTube spike". Spike only: nothing in the app uses this.
 *
 * Runs ONE step per command, so every paid call is a deliberate choice:
 *
 *   node --env-file=.env.local scripts/youtube-spike.mjs credits      # balance                                     (0)
 *   node --env-file=.env.local scripts/youtube-spike.mjs sc-videos    # ScrapeCreators youtube/channel-videos, latest (1)
 *   node --env-file=.env.local scripts/youtube-spike.mjs sc-videos-p2 # same, page 2 via continuationToken          (1)
 *   node --env-file=.env.local scripts/youtube-spike.mjs sc-extras    # same with includeExtras (likes, comments)    (1)
 *   node --env-file=.env.local scripts/youtube-spike.mjs sc-video     # ScrapeCreators youtube/video, 1st video       (1)
 *   node --env-file=.env.local scripts/youtube-spike.mjs sc-short     # ScrapeCreators youtube/video, a Short         (1)
 *   node --env-file=.env.local scripts/youtube-spike.mjs sc-missing   # made-up handle, ScrapeCreators               (0–1)
 *   node --env-file=.env.local scripts/youtube-spike.mjs yt-videos    # youtube-com videos/channel_videos (subs)     (5)
 *   node --env-file=.env.local scripts/youtube-spike.mjs yt-shorts    # youtube-com videos/channel_shorts            (5)
 *   node --env-file=.env.local scripts/youtube-spike.mjs yt-missing   # made-up handle, youtube-com                  (0–5)
 *
 * Channel: --channel=<@handle> (default @weightwatchers, a competitor that posts there; OBU's own
 * channel from its website is @obuhealth). Numbers in brackets are the team's catalogue price in Firecrawl
 * credits; the real cost is logged.
 *
 * Safety (same as facebook-x-spike.mjs):
 * - The API key is read from the environment and only ever placed in the Authorization header.
 *   Everything printed or saved goes through redact() first.
 * - Paid steps refuse to run twice (a saved result in .spike/ blocks a re-run) unless you pass --again.
 * - Raw responses are saved to .spike/ (gitignored); every call's creditsCost is appended to
 *   .spike/yt-costs.log so the total can be checked against the balance.
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
const CHANNEL = `@${(flag("channel") ?? "weightwatchers").replace(/^@/, "")}`;
const MISSING = "@zz30reachnosuchchannel7q";

const KEY = process.env.FIRECRAWL_API_KEY;
if (!KEY) {
  console.error(
    "FIRECRAWL_API_KEY is not set. Run with: node --env-file=.env.local scripts/youtube-spike.mjs <step>",
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

const short = (value, n = 60) => {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
};

function save(step, data) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `yt-${step}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, redact(JSON.stringify(data, null, 2)));
  log(`Saved raw response → ${file}`);
}

function latestSaved(step) {
  try {
    const files = readdirSync(OUT_DIR)
      .filter((f) => f.startsWith(`yt-${step}-`))
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

/** One line per video, from either provider. */
function line(v) {
  const date = v.publishedTime ?? v.publishDate ?? v.published_text ?? v.publishedTimeText ?? "?";
  const counts = [
    ["type", v.type],
    ["views", v.viewCountInt ?? v.view_count_text ?? v.viewCountText],
    ["likes", v.likeCountInt ?? v.likeCount],
    ["comm", v.commentCountInt ?? v.commentCount],
    ["len", v.lengthSeconds ?? v.length_text ?? v.lengthText],
  ]
    .filter(([, x]) => x !== undefined && x !== null)
    .map(([k, x]) => `${k} ${x}`)
    .join(" ");
  return `  ${String(date).slice(0, 25)} | ${short(v.title ?? "")} | ${counts}`;
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
    join(OUT_DIR, "yt-costs.log"),
    `${new Date().toISOString()}\t${step}\t${provider}/${capability}\tcreditsCost=${cost}\n`,
  );
  // Errors come back with HTTP 200 and success: true — always check the per-call error.
  if (result.error) log("Error:", result.error);
  if (result.requiresAction) log("Requires action (terms?):", result.requiresAction);
  if (result.warnings ?? result.data?.warnings)
    log("Warnings:", result.warnings ?? result.data.warnings);

  const data = result.data ?? {};
  const top = Object.keys(data).sort();
  if (top.length) log("Top-level fields:", top);
  // Channel header (subscribers etc.): everything that isn't the list.
  const header = Object.fromEntries(
    Object.entries(data).filter(([k, v]) => !Array.isArray(v) && typeof v !== "object"),
  );
  if (Object.keys(header).length) log("Scalars:", header);
  if (data.channel && typeof data.channel === "object") log("channel:", data.channel);
  const list = [data.videos, data.shorts, data.items].find(Array.isArray);
  if (!list) return;
  log(`Items on this page: ${list.length}`);
  const keys = new Set();
  list.forEach((v) => Object.keys(v ?? {}).forEach((k) => keys.add(k)));
  log("Fields across items:", [...keys].sort());
  list.forEach((v) => log(line(v)));
}

function scVideosPage2() {
  const token = savedResult("sc-videos").data?.continuationToken;
  if (!token) throw new Error("sc-videos returned no continuationToken.");
  return call("sc-videos-p2", "scrapecreators", "youtube/channel-videos", {
    handle: CHANNEL,
    continuationToken: token,
  });
}

function scOneVideo() {
  const url = savedResult("sc-videos").data?.videos?.[0]?.url;
  if (!url) throw new Error("sc-videos returned no video.");
  return call("sc-video", "scrapecreators", "youtube/video", { url });
}

function scOneShort() {
  const url = savedResult("yt-shorts").data?.videos?.[0]?.url;
  if (!url) throw new Error("Run yt-shorts first (it returns the channel's Shorts).");
  return call("sc-short", "scrapecreators", "youtube/video", { url });
}

// ---------------------------------------------------------------- main

const STEPS = {
  credits: { paid: false, run: credits },
  "sc-videos": {
    paid: true,
    run: () =>
      call("sc-videos", "scrapecreators", "youtube/channel-videos", {
        handle: CHANNEL,
        sort: "latest",
      }),
  },
  "sc-videos-p2": { paid: true, run: scVideosPage2 },
  "sc-extras": {
    paid: true,
    run: () =>
      call("sc-extras", "scrapecreators", "youtube/channel-videos", {
        handle: CHANNEL,
        sort: "latest",
        includeExtras: "true",
      }),
  },
  "sc-video": { paid: true, run: scOneVideo },
  "sc-short": { paid: true, run: scOneShort },
  "sc-missing": {
    paid: true,
    run: () =>
      call("sc-missing", "scrapecreators", "youtube/channel-videos", {
        handle: MISSING,
        sort: "latest",
      }),
  },
  "yt-videos": {
    paid: true,
    run: () => call("yt-videos", "youtube-com", "videos/channel_videos", { channel: CHANNEL }),
  },
  "yt-shorts": {
    paid: true,
    run: () => call("yt-shorts", "youtube-com", "videos/channel_shorts", { channel: CHANNEL }),
  },
  "yt-missing": {
    paid: true,
    run: () => call("yt-missing", "youtube-com", "videos/channel_videos", { channel: MISSING }),
  },
};

const stepName = args.find((a) => !a.startsWith("--"));
const step = STEPS[stepName];
if (!step) {
  console.error(
    `Usage: scripts/youtube-spike.mjs <${Object.keys(STEPS).join(" | ")}> [--channel=<@handle>] [--again]`,
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
