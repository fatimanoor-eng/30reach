// Shared Deno code for the AI functions (Slice 11): the Groq call and loading the saved pull.
// Pure logic lives in ai-logic.ts (tested); this file only does I/O.
//
// GROQ_API_KEY (and optionally GROQ_MODEL) come from Supabase secrets. The key is never returned or
// logged. Every Groq response's x-ratelimit-* headers are saved to usage_meters['groq'], and its
// token use is logged (Supabase → Edge Functions → Logs), never the prompt or the answer.

import {
  DEFAULT_GROQ_MODEL,
  type Format,
  GROQ_URL,
  groqErrorLog,
  type GroqMode,
  groqRequestBody,
  groqRetryAfter,
  type PullData,
  parseGroqJson,
  parseGroqMeter,
  type Platform,
  retryModeAfter,
  type SummaryPost,
  tokenLog,
} from "./ai-logic.ts";
import { json, type SupabaseClient } from "./server.ts";

export const groqModel = () => Deno.env.get("GROQ_MODEL")?.trim() || DEFAULT_GROQ_MODEL;

export type AiFailure =
  | { ok: false; error: "rate_limited"; retryAfter: number }
  | { ok: false; error: "ai_invalid" | "ai_unavailable" | "not_configured" };
export type AiResult<T> = { ok: true; value: T } | AiFailure;

type JsonSchema = { name: string; schema: Record<string, unknown> };

async function saveMeter(admin: SupabaseClient, headers: Headers, model: string) {
  const meter = parseGroqMeter(headers, model);
  if (!meter) return;
  const { error } = await admin
    .from("usage_meters")
    .upsert({ key: "groq", value: meter, updated_at: new Date().toISOString() });
  if (error) console.error(`usage_meters groq write failed (${error.code ?? "unknown"})`);
}

/**
 * One JSON answer from Groq (strict schema), validated by `validate`. If the JSON is cut off,
 * invalid or fails validation, asks ONCE more (`validate` gets the attempt number, so the last try
 * can be a little more lenient). 429 → rate_limited (the browser decides about waiting).
 * Every HTTP error is logged with Groq's error body (groqErrorLog). One exception to "never retry a
 * 400": json_validate_failed (strict mode refused an answer, e.g. a missing key) is retried ONCE in
 * json_object mode, and `validate` fills missing keys with safe defaults. Other errors aren't
 * retried: the same request would fail the same way.
 */
export async function groqJson<T>(o: {
  admin: SupabaseClient;
  fn: string;
  /** Log label when it differs from fn ("ask-blip light"). */
  label?: string;
  system: string;
  user: string;
  schema: JsonSchema;
  maxTokens: number;
  validate: (raw: unknown, attempt: number) => T | null;
}): Promise<AiResult<T>> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return { ok: false, error: "not_configured" };
  const model = groqModel();
  let mode: GroqMode = "strict";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const label = `${o.label ?? o.fn}${mode === "json_object" ? " (json_object)" : ""}`;
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          groqRequestBody({
            model,
            system: o.system,
            user: o.user,
            schema: o.schema,
            maxTokens: o.maxTokens,
            mode,
          }),
        ),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      console.error(`${o.fn}: Groq request failed (${(err as Error).name})`);
      return { ok: false, error: "ai_unavailable" };
    }

    await saveMeter(o.admin, res.headers, model);

    if (res.status === 429) {
      await res.body?.cancel();
      return { ok: false, error: "rate_limited", retryAfter: groqRetryAfter(res.headers) };
    }
    if (!res.ok) {
      // Only a strict json_validate_failed gets one json_object retry; anything else would fail again.
      const text = await res.text().catch(() => "");
      console.error(`${groqErrorLog(label, res.status, text)} (attempt ${attempt})`);
      const next = retryModeAfter(res.status, text, attempt, mode);
      if (!next) return { ok: false, error: "ai_unavailable" };
      mode = next;
      continue;
    }

    const body: unknown = await res.json().catch(() => null);
    console.log(`${tokenLog(label, body, res.headers)} (attempt ${attempt})`);
    const value = o.validate(parseGroqJson(body), attempt);
    if (value !== null) return { ok: true, value };
    console.error(`${label}: invalid answer (attempt ${attempt})`);
  }
  return { ok: false, error: "ai_invalid" };
}

/** AiFailure → HTTP. 429 keeps Groq's wait time so the UI can say "try again in a minute". */
export function aiFailure(f: AiFailure): Response {
  if (f.error === "rate_limited")
    return json({ error: "rate_limited", retryAfter: f.retryAfter }, 429);
  if (f.error === "not_configured") return json({ error: "not_configured" }, 500);
  return json({ error: f.error }, 502);
}

// ───────────────────────────────────────────── the saved pull
const POST_COLUMNS =
  "id, competitor_id, platform, external_id, url, posted_at, format, caption, hashtags, likes, comments, views, counts_hidden";

export type LoadedPull =
  | { ok: true; data: PullData; posts: Map<string, SummaryPost & { url: string }> }
  | { ok: false; error: "no_client" | "no_pull" | "load_failed" };

/**
 * The latest good real pull (+ the one before it, for "what changed"), read AS THE CALLER (RLS).
 * Hidden rows and test pulls are left out, like the dashboards.
 */
export async function loadPull(
  db: SupabaseClient,
  clientId: string,
  opts: { previous: boolean },
): Promise<LoadedPull> {
  const [{ data: client }, { data: pulls, error: pullsError }] = await Promise.all([
    db.from("clients").select("name").eq("id", clientId).maybeSingle(),
    db
      .from("pulls")
      .select("id, started_at")
      .eq("client_id", clientId)
      .eq("is_test", false)
      .in("status", ["done", "partial"])
      .order("started_at", { ascending: false })
      .limit(opts.previous ? 2 : 1),
  ]);
  if (!client) return { ok: false, error: "no_client" };
  if (pullsError) return { ok: false, error: "load_failed" };
  if (!pulls?.length) return { ok: false, error: "no_pull" };

  const [latest, prev] = pulls as { id: string; started_at: string }[];
  const [brands, posts, prevPosts, tasks] = await Promise.all([
    db.from("competitors").select("id, name").eq("client_id", clientId),
    db.from("posts").select(POST_COLUMNS).eq("pull_id", latest.id).eq("hidden", false),
    prev
      ? db.from("posts").select(POST_COLUMNS).eq("pull_id", prev.id).eq("hidden", false)
      : Promise.resolve({ data: [], error: null }),
    db.from("pull_tasks").select("competitor_id, platform, followers").eq("pull_id", latest.id),
  ]);
  if (brands.error || posts.error || prevPosts.error || tasks.error) {
    return { ok: false, error: "load_failed" };
  }
  const rows = (posts.data ?? []) as SummaryPost[];
  return {
    ok: true,
    data: {
      clientName: (client as { name: string }).name,
      brands: (brands.data ?? []) as { id: string; name: string }[],
      pull: latest,
      posts: rows,
      followers: (tasks.data ?? []) as {
        competitor_id: string;
        platform: Platform;
        followers: number | null;
      }[],
      previous: prev ? { ...prev, posts: (prevPosts.data ?? []) as SummaryPost[] } : null,
    },
    posts: new Map(rows.map((p) => [p.id, p])),
  };
}

/** What the browser needs to show a source link ("Hims · TikTok · 9 Nov · 212K views ↗"). */
export function sourcePost(p: SummaryPost, brands: { id: string; name: string }[]) {
  return {
    id: p.id,
    brand: brands.find((b) => b.id === p.competitor_id)?.name ?? "Unknown",
    platform: p.platform,
    format: p.format as Format | null,
    postedAt: p.posted_at,
    url: p.url,
    likes: p.likes,
    views: p.views,
  };
}

export const loadFailure = (error: "no_client" | "no_pull" | "load_failed") =>
  json({ error }, error === "no_pull" ? 409 : error === "no_client" ? 404 : 500);
