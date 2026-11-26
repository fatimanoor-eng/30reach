#!/usr/bin/env node
/**
 * Multi-client spike (24 Nov 2026) — website → brand profile, competitor discovery, content profile.
 * Results: docs/INTEGRATIONS.md → "Multi-client spike".
 *
 * One step per command, so every paid call is a deliberate choice:
 *
 *   node --env-file=.env.local scripts/client-spike.mjs credits                      # balance (0)
 *   node --env-file=.env.local scripts/client-spike.mjs scrape <name> <url>          # home page: markdown + links + branding (1)
 *   node --env-file=.env.local scripts/client-spike.mjs scrape <name> <url> --json  # same + LLM extraction (5)
 *   node --env-file=.env.local scripts/client-spike.mjs search <name> "<query>" [--limit=10] [--country=US]  # (2 per 10)
 *   node --env-file=.env.local scripts/client-spike.mjs links <name>                # social links from a saved scrape (0)
 *   node --env-file=.env.local scripts/client-spike.mjs groq <name> <scrape-name>   # Groq content profile (0 Firecrawl)
 *   node --env-file=.env.local scripts/client-spike.mjs spent                       # sum of the cost log (0)
 *
 * Safety:
 * - Keys are read from the environment and only placed in Authorization headers; everything printed or
 *   saved goes through redact() first.
 * - Paid steps refuse to run twice for the same name unless you pass --again, and refuse to start once the
 *   logged spend reaches the cap (40 credits, approved 24 Nov).
 * - Raw responses go to .spike/ (gitignored); each paid call appends its cost and the balance before /
 *   after to .spike/client-costs.log.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const API = "https://api.firecrawl.dev/v2";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const OUT_DIR = ".spike";
const COST_LOG = join(OUT_DIR, "client-costs.log");
const CAP = 52; // 40 approved 24 Nov + 12 for the discovery 2.0 spike (Coupon Chaser), approved 25 Nov

const [step, ...rest] = process.argv.slice(2);
const positional = rest.filter((a) => !a.startsWith("--"));
/** --name=value → "value"; bare --name → "true"; absent → undefined. */
const flag = (name) => {
  const hit = rest.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
};

const KEY = process.env.FIRECRAWL_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
if (!KEY) {
  console.error(
    "FIRECRAWL_API_KEY is not set. Run with: node --env-file=.env.local scripts/client-spike.mjs <step>",
  );
  process.exit(1);
}

function redact(text) {
  let s = String(text).split(KEY).join("[redacted]");
  if (GROQ_KEY) s = s.split(GROQ_KEY).join("[redacted]");
  return s;
}
const log = (...parts) =>
  console.log(
    redact(parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p, null, 2))).join(" ")),
  );

function save(kind, name, data) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `client-${kind}-${name}.json`);
  writeFileSync(file, redact(JSON.stringify(data, null, 2)));
  log(`Saved → ${file}`);
}
const load = (kind, name) => {
  const file = join(OUT_DIR, `client-${kind}-${name}.json`);
  if (!existsSync(file))
    throw new Error(`Nothing saved for ${kind} "${name}". Run that step first.`);
  return JSON.parse(readFileSync(file, "utf8"));
};

function spent() {
  if (!existsSync(COST_LOG)) return 0;
  return readFileSync(COST_LOG, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .reduce((sum, line) => sum + (Number(/charged=(\d+)/.exec(line)?.[1]) || 0), 0);
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

async function balance() {
  const { status, json } = await firecrawl("GET", "/team/credit-usage");
  return status === 200 ? json.data?.remainingCredits : null;
}

/** A paid call: cap check, balance before / after, cost log. */
async function paid(kind, name, run) {
  if (existsSync(join(OUT_DIR, `client-${kind}-${name}.json`)) && !flag("again"))
    throw new Error(`${kind} "${name}" already ran. Pass --again to pay for it again.`);
  const so_far = spent();
  if (so_far >= CAP) throw new Error(`Cap reached: ${so_far} of ${CAP} credits logged.`);
  const before = await balance();
  const result = await run();
  // credit-usage can lag a moment behind; wait briefly before reading it again.
  await new Promise((r) => setTimeout(r, 4000));
  const after = await balance();
  const reported = result.json?.creditsUsed ?? result.json?.data?.metadata?.creditsUsed ?? null;
  const charged = before != null && after != null ? before - after : (reported ?? 0);
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(
    COST_LOG,
    `${new Date().toISOString()}\t${kind}\t${name}\treported=${reported}\tcharged=${charged}\tbalance=${before}->${after}\n`,
  );
  log(
    `HTTP ${result.status} · ${result.ms} ms · reported ${reported} · charged ${charged} (balance ${before} → ${after}) · spike total ${spent()} / ${CAP}`,
  );
  return result;
}

// ---------------------------------------------------------------- social links
const SOCIAL = [
  ["instagram", /(^|\.)instagram\.com$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["facebook", /(^|\.)(facebook\.com|fb\.com)$/],
  ["linkedin", /(^|\.)linkedin\.com$/],
  ["x", /(^|\.)(twitter\.com|x\.com)$/],
  ["youtube", /(^|\.)(youtube\.com|youtu\.be)$/],
  ["pinterest", /(^|\.)pinterest\.[a-z.]+$/],
  ["threads", /(^|\.)threads\.(net|com)$/],
  ["snapchat", /(^|\.)snapchat\.com$/],
];
/** Every link → { platform: [unique profile URLs] }; share / intent links are left out. */
export function socialLinks(links) {
  const out = {};
  for (const raw of links ?? []) {
    let u;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    const host = u.hostname.toLowerCase();
    const hit = SOCIAL.find(([, re]) => re.test(host));
    if (!hit) continue;
    if (/\/(share|sharer|intent|dialog|plugins)\b/i.test(u.pathname)) continue;
    const clean = `${u.origin}${u.pathname}`.replace(/\/$/, "");
    (out[hit[0]] ??= []).includes(clean) || out[hit[0]].push(clean);
  }
  return out;
}

// ---------------------------------------------------------------- steps
async function scrape() {
  const [name, url] = positional;
  if (!name || !url) throw new Error("Usage: scrape <name> <url> [--json]");
  const json = flag("json") === "true";
  const formats = ["markdown", "links", "branding"];
  if (json)
    formats.push({
      type: "json",
      prompt:
        "Extract the brand behind this website: its name, a one-sentence description of what it sells or does, the country it is based in or mainly serves, its industry, and every official social media profile URL.",
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          country: { type: "string" },
          industry: { type: "string" },
          social_profiles: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description"],
      },
    });
  const res = await paid(json ? "scrapejson" : "scrape", name, () =>
    firecrawl("POST", "/scrape", { url, formats, onlyMainContent: false }),
  );
  save(json ? "scrapejson" : "scrape", name, {
    request: { url, formats: formats.map((f) => (typeof f === "string" ? f : f.type)) },
    ...res,
  });
  const d = res.json?.data ?? {};
  log(
    "Title:",
    d.metadata?.title,
    "| og:",
    d.metadata?.ogTitle,
    "| lang:",
    d.metadata?.language,
    "| status:",
    d.metadata?.statusCode,
  );
  log("Description:", d.metadata?.description ?? d.metadata?.ogDescription);
  log("Markdown chars:", d.markdown?.length ?? 0, "| links:", d.links?.length ?? 0);
  log("Branding keys:", Object.keys(d.branding ?? {}));
  if (d.branding) log("Branding (short):", JSON.stringify(d.branding).slice(0, 600));
  if (d.json) log("JSON extraction:", d.json);
  log("Social links:", socialLinks(d.links));
  if (res.json?.error) log("Error:", res.json.error);
}

async function search() {
  const [name, query] = positional;
  if (!name || !query)
    throw new Error('Usage: search <name> "<query>" [--limit=10] [--country=US]');
  const limit = Number(flag("limit") ?? 10);
  const body = { query, limit, ...(flag("country") ? { country: flag("country") } : {}) };
  const res = await paid("search", name, () => firecrawl("POST", "/search", body));
  save("search", name, { request: body, ...res });
  const web = res.json?.data?.web ?? res.json?.data ?? [];
  log(`Results: ${Array.isArray(web) ? web.length : "?"}`);
  for (const r of Array.isArray(web) ? web : []) log(`- ${r.title} | ${r.url}`);
  if (res.json?.error) log("Error:", res.json.error);
}

function links() {
  const [name] = positional;
  const kind = existsSync(join(OUT_DIR, `client-scrape-${name}.json`)) ? "scrape" : "scrapejson";
  log(socialLinks(load(kind, name).json?.data?.links));
}

async function groq() {
  const [name, scrapeName] = positional;
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY is not set in .env.local.");
  const kind = existsSync(join(OUT_DIR, `client-scrape-${scrapeName}.json`))
    ? "scrape"
    : "scrapejson";
  const d = load(kind, scrapeName).json?.data ?? {};
  const page = (d.markdown ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 9000);
  const system = `You profile a brand for a social media planning tool used by an agency.
From the brand's own website text, return ONE JSON object with:
- name, description (one sentence: what it sells / does), country (ISO 3166-1 alpha-2 where it is based or mainly sells; null if unclear), language,
- industry (short, e.g. "telehealth / weight loss", "children's clothing"), audience (one short phrase),
- regulated: array of topics from this list that apply: ["health","medical claims","weight loss","pharma","finance","alcohol","gambling","tobacco","kids","cannabis","supplements","legal","none"],
- content_rules: 2-5 short rules for social posts that fit this industry and region (e.g. "No before/after weight-loss claims"), each {rule, why},
- checks: which automatic checks to turn on: {"health_claims": bool, "finance_claims": bool, "alcohol_age": bool, "kids_safety": bool},
- calendar: {"holidays_country": ISO code or null, "health_months": bool},
- competitor_search_queries: 2 web-search queries that would find direct competitors (same product, same country/market),
- confidence: "high" | "medium" | "low", with notes for anything you guessed.
Only use what the text supports; say null rather than guess.`;
  const body = {
    model: GROQ_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `<site url="${d.metadata?.sourceURL ?? d.metadata?.url ?? ""}" title="${d.metadata?.title ?? ""}">\n${page}\n</site>`,
      },
    ],
  };
  const started = Date.now();
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => ({}));
  const content = json.choices?.[0]?.message?.content;
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    /* keep raw */
  }
  save("groq", name, {
    status: res.status,
    ms: Date.now() - started,
    usage: json.usage,
    parsed,
    raw: parsed ? undefined : (content ?? json),
  });
  log(`HTTP ${res.status} · ${Date.now() - started} ms · tokens ${json.usage?.total_tokens}`);
  log(parsed ?? content ?? json.error);
}

/** One Alexandria provider call: alexandria <name> <provider> <capability> '<options JSON>'. */
async function alexandria() {
  const [name, provider, capability, optionsJson] = positional;
  if (!name || !provider || !capability)
    throw new Error("Usage: alexandria <name> <provider> <capability> '<options JSON>'");
  const options = optionsJson ? JSON.parse(optionsJson) : {};
  const res = await paid("alexandria", name, () =>
    firecrawl("POST", "/scrape", { alexandria: { provider, capability, options } }),
  );
  save("alexandria", name, { request: { provider, capability, options }, ...res });
  const item = res.json?.data?.alexandria?.[0] ?? {};
  if (item.error) log("Error:", item.error);
  const items = item.data?.output?.data?.items ?? item.data?.items ?? [];
  log(`creditsCost ${item.creditsCost ?? res.json?.data?.creditsCost} · items ${items.length}`);
  for (const t of items)
    log(
      `- ${t.createdUtc ? new Date(t.createdUtc * 1000).toISOString().slice(0, 10) : "?"} @${t.authorUsername ?? "?"} reply=${t.isReply ?? "?"} likes=${t.likeCount ?? "?"} views=${t.viewCount ?? "?"} | ${String(
        t.text ?? "",
      )
        .slice(0, 70)
        .replace(/\n/g, " ")}`,
    );
}

const STEPS = {
  credits: async () => log(`Remaining: ${await balance()}`),
  alexandria,
  scrape,
  search,
  links,
  groq,
  spent: async () => log(`Logged spend: ${spent()} / ${CAP}`),
};

const run = STEPS[step];
if (!run) {
  console.error(`Unknown step "${step}". Steps: ${Object.keys(STEPS).join(", ")}`);
  process.exit(1);
}
Promise.resolve()
  .then(run)
  .catch((err) => {
    console.error(redact(err.message));
    process.exit(1);
  });
