// Pure helpers for the AI Edge Functions (Slice 11): ask-blip, plan-month, check-claims, suggest-hooks.
// No Deno APIs here, so Vitest can test them (ai-logic.test.ts).
//
// Rules this file enforces (CLAUDE.md, AI_PROMPTS.md):
// - Never send raw pulls: the model gets a compact summary (counts, averages, ~25 top posts with
//   short captions). Posts are referred to as p1…pN; real ids never leave the server.
// - Validate every JSON answer by hand (no zod). Anything off-shape → null → the caller retries once.
// - No emojis in text that becomes idea text, card titles or hooks.

import { parseRetryAfter } from "./pull-logic.ts";

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Size limits. They keep every request well under Groq's 8K tokens/minute. */
export const LIMITS = {
  question: 500,
  historyTurns: 2,
  historyChars: 600,
  /** ≈ 2.5K tokens at ~4 chars/token. */
  summaryChars: 10_000,
  topPosts: 25,
  topPerBrand: 2,
  captionChars: 120,
  hashtags: 10,
  boardIdeas: 15,
  ideaNoteChars: 100,
  events: 40,
  eventName: 80,
  fieldChars: 1200,
  draftChars: 2400,
  hookContextPosts: 5,
  hookChars: 100,
  titleChars: 60,
  reasonChars: 140,
  whyChars: 140,
  planIdeas: 6,
} as const;

export type Platform = "instagram" | "tiktok";
export type Format = "reel" | "carousel" | "image" | "video";

export const PLATFORMS: Platform[] = ["instagram", "tiktok"];
export const FORMATS_BY_PLATFORM: Record<Platform, Format[]> = {
  instagram: ["reel", "carousel", "image"],
  tiktok: ["video", "carousel"],
};
const FORMAT_LABEL: Record<Format, string> = {
  reel: "Reels",
  carousel: "Carousels",
  image: "Images",
  video: "Videos",
};
const PLATFORM_LABEL: Record<Platform, string> = { instagram: "Instagram", tiktok: "TikTok" };

// ───────────────────────────────────────────── small helpers
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => isStr(v) && UUID.test(v);
const round = (n: number) => Math.round(n);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Collapses whitespace and trims. */
export const squish = (s: string) => s.replace(/\s+/g, " ").trim();

/** Cuts at a word boundary and adds "…" when it had to cut. */
export function clip(s: string, max: number): string {
  const t = squish(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** Removes emoji (and their joiners / variation selectors). For idea text, titles and hooks. */
export function stripEmoji(s: string): string {
  // Alternation, not one character class: joiners/selectors in a class trip no-misleading-character-class.
  return squish(
    s.replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}/gu, ""),
  );
}

/** "Fatima Noor" → "Fatima"; falls back to the email's local part; null if neither. */
export function firstName(
  fullName: string | null | undefined,
  email?: string | null,
): string | null {
  const fromName = fullName?.trim().split(/\s+/)[0];
  if (fromName) return clip(fromName, 30);
  const local = email?.split("@")[0]?.split(/[._-]/)[0];
  return local ? clip(local.charAt(0).toUpperCase() + local.slice(1), 30) : null;
}

const EASTERN_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  day: "numeric",
  month: "short",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  day: "numeric",
  month: "short",
  year: "numeric",
});
/** "9 Nov" (US Eastern). */
export const dayMonth = (iso: string) => DAY_MONTH.format(new Date(iso));
/** "17 Nov 2026" (US Eastern). */
export const dayMonthYear = (iso: string) => DAY_MONTH_YEAR.format(new Date(iso));

/** Same day parts as the Social page (social-metrics.ts), US Eastern. */
type DayPart = "morning" | "midday" | "afternoon" | "evening" | "night";
function dayPart(hour: number): DayPart {
  if (hour >= 6 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}
/** "Tue evening" for a post time (US Eastern). */
export function slotOf(iso: string): string {
  const parts = EASTERN_PARTS.formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  return `${weekday} ${dayPart(hour)}`;
}

// ───────────────────────────────────────────── compact summary
export type SummaryPost = {
  id: string;
  competitor_id: string;
  platform: Platform;
  external_id: string;
  url: string;
  posted_at: string | null;
  format: Format | null;
  caption: string | null;
  hashtags: string[] | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  counts_hidden: boolean;
};
export type SummaryBrand = { id: string; name: string };
export type Followers = { competitor_id: string; platform: Platform; followers: number | null };
export type PullData = {
  clientName: string;
  brands: SummaryBrand[];
  pull: { id: string; started_at: string };
  posts: SummaryPost[];
  followers: Followers[];
  previous: { id: string; started_at: string; posts: SummaryPost[] } | null;
};

const engagement = (p: SummaryPost) => (p.likes ?? 0) + (p.comments ?? 0);
const countable = (p: SummaryPost) => !p.counts_hidden;

/** Strongest weekday + day part by avg engagement; needs ≥ 2 posts (no single viral post). */
export function bestSlot(posts: SummaryPost[]): string | null {
  const slots = new Map<string, number[]>();
  for (const p of posts.filter(countable)) {
    if (!p.posted_at) continue;
    const key = slotOf(p.posted_at);
    slots.set(key, [...(slots.get(key) ?? []), engagement(p)]);
  }
  const best = [...slots]
    .filter(([, list]) => list.length >= 2)
    .map(([key, list]) => ({ key, avg: avg(list) }))
    .sort((a, b) => b.avg - a.avg)[0];
  return best?.key ?? null;
}

/** Format with the best avg engagement; needs ≥ 3 posts (same rule as the Overview KPI). */
export function bestFormat(posts: SummaryPost[]): Format | null {
  const by = new Map<Format, number[]>();
  for (const p of posts.filter(countable)) {
    if (!p.format) continue;
    by.set(p.format, [...(by.get(p.format) ?? []), engagement(p)]);
  }
  const best = [...by]
    .filter(([, list]) => list.length >= 3)
    .map(([f, list]) => ({ f, avg: avg(list) }))
    .sort((a, b) => b.avg - a.avg)[0];
  return best?.f ?? null;
}

export type Summary = {
  client: string;
  pull_date: string;
  window_days: 30;
  time_zone: "US Eastern";
  engagement_means: "likes + comments";
  total_posts: number;
  brands: {
    brand: string;
    platform: Platform;
    posts: number;
    small_sample: boolean;
    avg_likes: number;
    avg_comments: number;
    avg_views: number | null;
    followers: number | null;
    formats: { format: Format; posts: number; avg_engagement: number }[];
    best_slot: string | null;
    new_since_previous: number | null;
  }[];
  top_posts: {
    ref: string;
    brand: string;
    platform: Platform;
    date: string | null;
    slot: string | null;
    format: Format | null;
    likes: number | null;
    comments: number | null;
    views: number | null;
    caption: string;
  }[];
  top_hashtags: { tag: string; posts: number }[];
  previous: null | {
    pull_date: string;
    brands: { brand: string; platform: Platform; posts: number; avg_engagement: number }[];
  };
  not_in_data: string[];
};

/** Hard facts the model must not pretend to know. */
const NOT_IN_DATA = [
  "anything older than the 30-day window",
  "follower history or growth",
  "the client's own posts",
  "ad spend, reach or impressions",
  "Instagram shares and saves",
  "posts from last year",
];

function brandStats(posts: SummaryPost[]) {
  const c = posts.filter(countable);
  const views = c.map((p) => p.views).filter((v): v is number => v != null);
  return {
    posts: posts.length,
    avg_likes: round(avg(c.map((p) => p.likes ?? 0))),
    avg_comments: round(avg(c.map((p) => p.comments ?? 0))),
    avg_views: views.length ? round(avg(views)) : null,
    avg_engagement: round(avg(c.map(engagement))),
  };
}

/**
 * Top posts for the model: the best 2 per brand × platform first (so small brands are visible), then
 * the rest by engagement. Returns them in engagement order.
 */
export function pickTopPosts(posts: SummaryPost[], max: number = LIMITS.topPosts): SummaryPost[] {
  const ranked = posts.filter(countable).sort((a, b) => engagement(b) - engagement(a));
  const picked = new Set<SummaryPost>();
  const perGroup = new Map<string, number>();
  for (const p of ranked) {
    const key = `${p.competitor_id}|${p.platform}`;
    if ((perGroup.get(key) ?? 0) >= LIMITS.topPerBrand) continue;
    perGroup.set(key, (perGroup.get(key) ?? 0) + 1);
    picked.add(p);
  }
  for (const p of ranked) {
    if (picked.size >= max) break;
    picked.add(p);
  }
  return ranked.filter((p) => picked.has(p)).slice(0, max);
}

/**
 * The compact summary of the saved pull the model sees, plus `refs` (index i ↔ "p{i+1}" ↔ post id).
 * Shrinks itself (fewer top posts, then shorter captions) to stay under LIMITS.summaryChars.
 */
export function buildSummary(
  data: PullData,
  opts: { topPosts?: number; captionChars?: number } = {},
): { summary: Summary; refs: string[]; json: string } {
  const name = new Map(data.brands.map((b) => [b.id, b.name]));
  const brandName = (id: string) => name.get(id) ?? "Unknown";
  const prevIds = data.previous ? new Set(data.previous.posts.map((p) => p.external_id)) : null;

  const groups = new Map<string, SummaryPost[]>();
  for (const p of data.posts) {
    const key = `${p.competitor_id}|${p.platform}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const brands = [...groups].map(([key, posts]) => {
    const [competitorId, platform] = key.split("|") as [string, Platform];
    const s = brandStats(posts);
    const formats = (Object.keys(FORMAT_LABEL) as Format[])
      .map((f) => {
        const fp = posts.filter((p) => p.format === f);
        return { format: f, posts: fp.length, avg_engagement: brandStats(fp).avg_engagement };
      })
      .filter((f) => f.posts > 0);
    return {
      brand: brandName(competitorId),
      platform,
      posts: s.posts,
      small_sample: s.posts < 10,
      avg_likes: s.avg_likes,
      avg_comments: s.avg_comments,
      avg_views: s.avg_views,
      followers:
        data.followers.find((f) => f.competitor_id === competitorId && f.platform === platform)
          ?.followers ?? null,
      formats,
      best_slot: bestSlot(posts),
      new_since_previous: prevIds ? posts.filter((p) => !prevIds.has(p.external_id)).length : null,
    };
  });
  brands.sort((a, b) => a.brand.localeCompare(b.brand) || a.platform.localeCompare(b.platform));

  const tagCount = new Map<string, number>();
  for (const p of data.posts)
    for (const t of new Set(p.hashtags ?? [])) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const top_hashtags = [...tagCount]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, LIMITS.hashtags)
    .map(([tag, posts]) => ({ tag, posts }));

  let previous: Summary["previous"] = null;
  if (data.previous) {
    const pg = new Map<string, SummaryPost[]>();
    for (const p of data.previous.posts) {
      const key = `${p.competitor_id}|${p.platform}`;
      pg.set(key, [...(pg.get(key) ?? []), p]);
    }
    previous = {
      pull_date: dayMonthYear(data.previous.started_at),
      brands: [...pg]
        .map(([key, posts]) => {
          const [competitorId, platform] = key.split("|") as [string, Platform];
          const s = brandStats(posts);
          return {
            brand: brandName(competitorId),
            platform,
            posts: s.posts,
            avg_engagement: s.avg_engagement,
          };
        })
        .sort((a, b) => a.brand.localeCompare(b.brand) || a.platform.localeCompare(b.platform)),
    };
  }

  const maxTop = opts.topPosts ?? LIMITS.topPosts;
  const captionChars = opts.captionChars ?? LIMITS.captionChars;
  const top = pickTopPosts(data.posts, maxTop);
  const summary: Summary = {
    client: data.clientName,
    pull_date: dayMonthYear(data.pull.started_at),
    window_days: 30,
    time_zone: "US Eastern",
    engagement_means: "likes + comments",
    total_posts: data.posts.length,
    brands,
    top_posts: top.map((p, i) => ({
      ref: `p${i + 1}`,
      brand: brandName(p.competitor_id),
      platform: p.platform,
      date: p.posted_at ? dayMonth(p.posted_at) : null,
      slot: p.posted_at ? slotOf(p.posted_at) : null,
      format: p.format,
      likes: p.likes,
      comments: p.comments,
      views: p.views,
      caption: clip(stripEmoji(p.caption ?? ""), captionChars),
    })),
    top_hashtags,
    previous,
    not_in_data: NOT_IN_DATA,
  };
  const json = JSON.stringify(summary);
  if (json.length > LIMITS.summaryChars) {
    if (maxTop > 10) return buildSummary(data, { topPosts: maxTop - 5, captionChars });
    if (captionChars > 60) return buildSummary(data, { topPosts: maxTop, captionChars: 60 });
  }
  return { summary, refs: top.map((p) => p.id), json };
}

/** "p3" / "post:p3" / "[post:p3]" → the real post id, or null. */
export function refToId(ref: string, refs: string[]): string | null {
  const m = /^\[?(?:post:)?p(\d{1,3})\]?$/i.exec(ref.trim());
  if (!m) return null;
  return refs[Number(m[1]) - 1] ?? null;
}

/** Inline citations the model may still write ("[post:p3]", "[p3]") — removed from shown text. */
const INLINE_REF = /\s*\[(?:post:)?p\d{1,3}(?:\s*,\s*(?:post:)?p\d{1,3})*\]/gi;
const inlineRefs = (s: string) =>
  [...s.matchAll(/\[((?:post:)?p\d{1,3}(?:\s*,\s*(?:post:)?p\d{1,3})*)\]/gi)].flatMap((m) =>
    [...m[1].matchAll(/p(\d{1,3})/gi)].map((x) => `p${x[1]}`),
  );

/** Engagement-ranked: the "30reach looked at" chips on 10 come from code, never the model. */
export function planFacts(posts: SummaryPost[], eventCount: number, boardIdeas: number) {
  const f = bestFormat(posts);
  return {
    events: eventCount,
    bestFormat: f ? FORMAT_LABEL[f] : null,
    bestTime: bestSlot(posts),
    boardIdeas,
  };
}

// ───────────────────────────────────────────── health red flags (code, not AI)
/**
 * A small, conservative list that always runs (even if the model misses it). The model's check
 * catches the rest. Advisory only. Returns the exact matched text from `text`.
 */
const RED_FLAGS: [RegExp, string][] = [
  [/\bguarantee[sd]?\b/i, "Promises a result."],
  [/\bcure[sd]?\b/i, "Sounds like a medical claim."],
  [/\b(?:lose|drop|shed)\s+\d+\s*(?:lbs?|pounds?|kgs?|kilos?)\b/i, "Promises weight loss."],
  [
    /\b\d+\s*(?:lbs?|pounds?|kgs?)\s+in\s+\d+\s*(?:days?|weeks?|months?)\b/i,
    "Promises weight loss.",
  ],
  [/\bmelts?\s+(?:away\s+)?(?:belly\s+)?fat\b/i, "Promises weight loss."],
  [/\bmiracle\b/i, "Hype that implies results."],
  [/\bskyrocket(?:s|ing)?\b/i, "Hype word."],
  [/\bgame[- ]?changer\b/i, "Hype word."],
  [/\bguilt[- ]free\b/i, "Food guilt framing."],
  [/\b(?:cheat|junk)\s+(?:meals?|days?|foods?)\b/i, "Food guilt framing."],
  [/\b(?:bikini|beach)\s+body\b/i, "Body shaming."],
];

export type Issue = { quote: string; why: string };

export function healthRedFlags(text: string): Issue[] {
  const out: Issue[] = [];
  const spans: [number, number][] = [];
  for (const [re, why] of RED_FLAGS) {
    const m = re.exec(text);
    if (!m) continue;
    const [a, b] = [m.index, m.index + m[0].length];
    // One phrase is reported once ("Lose 10 lbs in 2 weeks" matches two patterns).
    if (spans.some(([x, y]) => a < y && x < b)) continue;
    spans.push([a, b]);
    out.push({ quote: m[0], why });
  }
  return out;
}

// ───────────────────────────────────────────── Groq response + rate-limit headers
export type GroqMeter = {
  model: string;
  remaining_requests: number | null;
  limit_requests: number | null;
  remaining_tokens: number | null;
  limit_tokens: number | null;
  reset_requests: string | null;
  reset_tokens: string | null;
};

type HeaderBag = { get(name: string): string | null };
const num = (v: string | null) => (v != null && /^\d+$/.test(v.trim()) ? Number(v) : null);

/** Groq's x-ratelimit-* headers (requests = per day, tokens = per minute). Null if none are there. */
export function parseGroqMeter(h: HeaderBag, model: string): GroqMeter | null {
  const meter: GroqMeter = {
    model,
    remaining_requests: num(h.get("x-ratelimit-remaining-requests")),
    limit_requests: num(h.get("x-ratelimit-limit-requests")),
    remaining_tokens: num(h.get("x-ratelimit-remaining-tokens")),
    limit_tokens: num(h.get("x-ratelimit-limit-tokens")),
    reset_requests: h.get("x-ratelimit-reset-requests"),
    reset_tokens: h.get("x-ratelimit-reset-tokens"),
  };
  return meter.remaining_requests == null && meter.remaining_tokens == null ? null : meter;
}

/** Seconds to wait after a 429 (Retry-After, capped at 120 s), else 60. */
export const groqRetryAfter = (h: HeaderBag) => parseRetryAfter(h.get("retry-after")) ?? 60;

/**
 * Chat completion body → the parsed JSON content. Null if it's cut off (finish_reason "length"),
 * empty or not JSON.
 */
export function parseGroqJson(body: unknown): unknown | null {
  const choice = isObj(body) && Array.isArray(body.choices) ? body.choices[0] : null;
  if (!isObj(choice) || choice.finish_reason === "length") return null;
  const content = isObj(choice.message) ? choice.message.content : null;
  if (!isStr(content) || !content.trim()) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────── JSON schemas (Groq strict mode)
// Strict mode: every property required, additionalProperties false. Lengths are checked in code.
const strictObject = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const strArray = { type: "array", items: { type: "string" } };

/**
 * One flat object for both reply types (strict mode needs every field anyway, and avoids relying on
 * anyOf support): "insight" fills lead…in_data and leaves message ""; "chat" fills message only.
 */
export const ASK_SCHEMA = {
  name: "blip_answer",
  schema: strictObject({
    type: { type: "string", enum: ["insight", "chat"] },
    message: { type: "string" },
    lead: { type: "string" },
    points: strArray,
    for_client: { type: "string" },
    post_refs: strArray,
    in_data: { type: "boolean" },
  }),
};

export const PLAN_SCHEMA = {
  name: "month_plan",
  schema: strictObject({
    ideas: {
      type: "array",
      items: strictObject({
        date: { type: "string" },
        platform: { type: "string", enum: PLATFORMS },
        format: { type: "string", enum: ["reel", "carousel", "image", "video"] },
        title: { type: "string" },
        reason: { type: "string" },
        source_refs: strArray,
      }),
    },
  }),
};

export const CLAIMS_SCHEMA = {
  name: "claim_check",
  schema: strictObject({
    status: { type: "string", enum: ["clear", "flagged"] },
    issues: {
      type: "array",
      items: strictObject({ quote: { type: "string" }, why: { type: "string" } }),
    },
  }),
};

export const HOOKS_SCHEMA = {
  name: "hooks",
  schema: strictObject({ hooks: strArray }),
};

// ───────────────────────────────────────────── inputs (from the browser)
export type InputError = { error: string };
const bad = (error: string): InputError => ({ error });
const optText = (v: unknown, max: number) => (isStr(v) ? v.trim().slice(0, max) : "");

export type AskInput = {
  clientId: string;
  question: string;
  history: { q: string; a: string }[];
};
export function parseAskInput(body: Record<string, unknown>): AskInput | InputError {
  if (!isUuid(body.clientId)) return bad("bad_client");
  const question = isStr(body.question) ? squish(body.question) : "";
  if (!question) return bad("empty_question");
  if (question.length > LIMITS.question) return bad("question_too_long");
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t): t is { q: string; a: string } => isObj(t) && isStr(t.q) && isStr(t.a))
    .slice(-LIMITS.historyTurns)
    .map((t) => ({ q: clip(t.q, LIMITS.historyChars), a: clip(t.a, LIMITS.historyChars) }));
  return { clientId: body.clientId, question, history };
}

export type PlanEvent = { date: string; name: string; kind: "holiday" | "marketing" | "health" };
export type PlanInput = { clientId: string; month: string; events: PlanEvent[] };
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A month from this month up to 3 months ahead ("2027-01"). `today` = "YYYY-MM-DD". */
export function parsePlanInput(
  body: Record<string, unknown>,
  today: string,
): PlanInput | InputError {
  if (!isUuid(body.clientId)) return bad("bad_client");
  if (!isStr(body.month) || !MONTH.test(body.month)) return bad("bad_month");
  const [y, m] = body.month.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  const diff = (y - ty) * 12 + (m - tm);
  if (diff < 0 || diff > 3) return bad("bad_month");
  const month = body.month;
  const events = (Array.isArray(body.events) ? body.events : [])
    .filter(
      (e): e is PlanEvent =>
        isObj(e) &&
        isStr(e.date) &&
        DATE.test(e.date) &&
        e.date.startsWith(`${month}-`) &&
        isStr(e.name) &&
        ["holiday", "marketing", "health"].includes(e.kind as string),
    )
    .slice(0, LIMITS.events)
    .map((e) => ({ date: e.date, name: clip(e.name, LIMITS.eventName), kind: e.kind }));
  return { clientId: body.clientId, month, events };
}

export type ClaimsInput = { cardId: string; draft: string };
/** Title / hook / caption / visual idea → one labelled draft. Error if there's nothing to check. */
export function parseClaimsInput(body: Record<string, unknown>): ClaimsInput | InputError {
  if (!isUuid(body.cardId)) return bad("bad_card");
  const parts: [string, string][] = [
    ["Title", optText(body.title, 200)],
    ["Hook", optText(body.hook, LIMITS.fieldChars)],
    ["Caption", optText(body.caption, LIMITS.fieldChars)],
    ["Visual idea", optText(body.visualIdea, LIMITS.fieldChars)],
  ];
  const draft = parts
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")
    .slice(0, LIMITS.draftChars);
  return draft ? { cardId: body.cardId, draft } : bad("nothing_to_check");
}

export type HooksInput = {
  clientId: string;
  title: string;
  caption: string;
  platform: Platform | null;
  format: Format | null;
};
export function parseHooksInput(body: Record<string, unknown>): HooksInput | InputError {
  if (!isUuid(body.clientId)) return bad("bad_client");
  const title = optText(body.title, 200);
  const caption = optText(body.caption, LIMITS.fieldChars);
  if (!title && !caption) return bad("nothing_to_use");
  const platform = PLATFORMS.includes(body.platform as Platform)
    ? (body.platform as Platform)
    : null;
  const format =
    platform && FORMATS_BY_PLATFORM[platform].includes(body.format as Format)
      ? (body.format as Format)
      : null;
  return { clientId: body.clientId, title, caption, platform, format };
}

// ───────────────────────────────────────────── output validators
export type AskInsight = {
  type: "insight";
  lead: string;
  points: string[];
  forClient: string;
  postIds: string[];
  inData: boolean;
};
/** Small talk (greetings, hype, thanks, feelings, off-topic): 1–2 sentences, then back to the data. */
export type AskChat = { type: "chat"; message: string };
export type AskAnswer = AskInsight | AskChat;

const cleanChat = (s: string, max: number) => clip(s.replace(INLINE_REF, ""), max);

const EMOJI =
  /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\u{FE0F}|\u{200D}\p{Extended_Pictographic})*|\p{Regional_Indicator}{1,2}/gu;
/** Keeps the first `max` emoji (a ZWJ sequence or flag counts as one) and drops the rest. */
export function capEmoji(s: string, max: number): string {
  let n = 0;
  return squish(s.replace(EMOJI, (m) => (++n <= max ? m : "")));
}

export const CHAT_CHARS = 280;
export const CHAT_EMOJI = 2;

/**
 * Ask Blip answer. Chat: a non-empty message (clipped, ≤ 2 emoji, no p-refs). Insight: citations are
 * mapped back to real post ids; unknown refs are dropped.
 */
export function validateAskAnswer(raw: unknown, refs: string[]): AskAnswer | null {
  if (!isObj(raw)) return null;
  if (raw.type === "chat") {
    if (!isStr(raw.message)) return null;
    const message = capEmoji(cleanChat(raw.message, CHAT_CHARS), CHAT_EMOJI);
    return message ? { type: "chat", message } : null;
  }
  if (raw.type !== "insight") return null;
  if (!isStr(raw.lead) || !Array.isArray(raw.points) || !isStr(raw.for_client)) return null;
  if (!Array.isArray(raw.post_refs) || typeof raw.in_data !== "boolean") return null;
  const lead = cleanChat(raw.lead, 300);
  if (!lead) return null;
  const points = raw.points
    .filter(isStr)
    .map((p) => cleanChat(p, 400))
    .filter(Boolean)
    .slice(0, 5);
  const texts = [raw.lead, ...raw.points.filter(isStr), raw.for_client];
  const cited = [...raw.post_refs.filter(isStr), ...texts.flatMap((t) => inlineRefs(t))];
  const postIds = [
    ...new Set(cited.map((r) => refToId(r, refs)).filter((id): id is string => !!id)),
  ];
  return {
    type: "insight",
    lead,
    points,
    forClient: cleanChat(raw.for_client, 300),
    postIds: postIds.slice(0, 8),
    inData: raw.in_data,
  };
}

/** "For OBU Health: try a weekly Q&A 🎯" → "Try a weekly Q&A" (the text saved as an AI idea). */
export function ideaFromAnswer(forClient: string, clientName: string): string {
  const prefix = new RegExp(
    `^for\\s+${clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:,-]\\s*`,
    "i",
  );
  const text = stripEmoji(forClient)
    .replace(prefix, "")
    .replace(/^for\s+\w+\s*:\s*/i, "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export type PlanIdea = {
  date: string;
  platform: Platform;
  format: Format;
  title: string;
  reason: string;
  sourcePostIds: string[];
};

const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * Plan {month} ideas. Each must be a real date in the month (not before `today`), a valid
 * platform + format pair, have a title and reason and no red flags. Emoji removed, lengths cut.
 * Null (→ retry) if fewer than `min` survive.
 */
export function validatePlan(
  raw: unknown,
  ctx: { month: string; today: string; refs: string[]; min?: number },
): PlanIdea[] | null {
  if (!isObj(raw) || !Array.isArray(raw.ideas)) return null;
  const last = `${ctx.month}-${String(daysInMonth(ctx.month)).padStart(2, "0")}`;
  const seen = new Set<string>();
  const ideas: PlanIdea[] = [];
  for (const i of raw.ideas) {
    if (!isObj(i) || !isStr(i.date) || !DATE.test(i.date)) continue;
    if (!i.date.startsWith(`${ctx.month}-`) || i.date > last || i.date < ctx.today) continue;
    const platform = i.platform as Platform;
    if (!PLATFORMS.includes(platform)) continue;
    if (!FORMATS_BY_PLATFORM[platform].includes(i.format as Format)) continue;
    const title = isStr(i.title) ? clip(stripEmoji(i.title), LIMITS.titleChars) : "";
    const reason = isStr(i.reason)
      ? clip(stripEmoji(i.reason.replace(INLINE_REF, "")), LIMITS.reasonChars)
      : "";
    if (!title || !reason) continue;
    if (healthRedFlags(`${title} ${reason}`).length) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const refs = Array.isArray(i.source_refs) ? i.source_refs.filter(isStr) : [];
    ideas.push({
      date: i.date,
      platform,
      format: i.format as Format,
      title,
      reason,
      sourcePostIds: [
        ...new Set(refs.map((r) => refToId(r, ctx.refs)).filter((x): x is string => !!x)),
      ],
    });
  }
  if (ideas.length < (ctx.min ?? 3)) return null;
  return ideas.sort((a, b) => a.date.localeCompare(b.date)).slice(0, LIMITS.planIdeas);
}

/** For matching quotes: lower case, straight quotes and dashes, single spaces. */
const norm = (s: string) =>
  squish(s.toLowerCase().replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-"));

export type ClaimsResult = { status: "clear" | "flagged"; issues: Issue[] };

/**
 * Claim check. Keeps only quotes really in the draft; adds the code red flags; status comes from
 * the issues, not from what the model said. Null (→ retry) if the model flagged something but none
 * of its quotes are in the draft and code found nothing either.
 */
export function validateClaims(raw: unknown, draft: string): ClaimsResult | null {
  if (!isObj(raw) || !Array.isArray(raw.issues)) return null;
  if (raw.status !== "clear" && raw.status !== "flagged") return null;
  const haystack = norm(draft);
  const issues: Issue[] = [];
  const add = (quote: string, why: string) => {
    const q = clip(quote.replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""), 200);
    if (!q || !haystack.includes(norm(q))) return;
    if (issues.some((x) => norm(x.quote).includes(norm(q)) || norm(q).includes(norm(x.quote))))
      return;
    issues.push({ quote: q, why: clip(stripEmoji(why) || "Check this wording.", LIMITS.whyChars) });
  };
  for (const i of raw.issues)
    if (isObj(i) && isStr(i.quote)) add(i.quote, isStr(i.why) ? i.why : "");
  for (const f of healthRedFlags(draft.replace(/^(Title|Hook|Caption|Visual idea): /gm, "")))
    add(f.quote, f.why);
  if (raw.status === "flagged" && raw.issues.length > 0 && issues.length === 0) return null;
  return { status: issues.length ? "flagged" : "clear", issues: issues.slice(0, 8) };
}

/** Hooks: plain text, no emoji or wrapping quotes, ≤ 100 chars, no red flags, no duplicates. */
export function validateHooks(raw: unknown, min = 3): string[] | null {
  if (!isObj(raw) || !Array.isArray(raw.hooks)) return null;
  const out: string[] = [];
  for (const h of raw.hooks) {
    if (!isStr(h)) continue;
    const text = stripEmoji(h)
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .trim();
    if (!text || text.length > LIMITS.hookChars) continue;
    if (healthRedFlags(text).length) continue;
    if (out.some((o) => o.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
  }
  return out.length >= min ? out.slice(0, 3) : null;
}

/** What works for competitors, small enough for the hooks prompt (top 5 openings + best format). */
export function hookContext(data: Pick<PullData, "brands" | "posts">, platform: Platform | null) {
  const name = new Map(data.brands.map((b) => [b.id, b.name]));
  const posts = platform ? data.posts.filter((p) => p.platform === platform) : data.posts;
  const f = bestFormat(posts);
  return {
    platform: platform ? PLATFORM_LABEL[platform] : "Instagram and TikTok",
    best_format: f ? FORMAT_LABEL[f] : null,
    top_openings: posts
      .filter(countable)
      .sort((a, b) => engagement(b) - engagement(a))
      .slice(0, LIMITS.hookContextPosts)
      .map((p) => ({
        brand: name.get(p.competitor_id) ?? "Unknown",
        format: p.format,
        first_line: clip(stripEmoji((p.caption ?? "").split("\n")[0]), 90),
        likes: p.likes,
        views: p.views,
      }))
      .filter((p) => p.first_line),
  };
}

/** FNV-1a: tells the card drawer whether the text changed since the last check. */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
