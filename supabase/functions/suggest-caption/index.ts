// `suggest-caption` Edge Function: "Suggest caption" in the card drawer (09 / M08), Slice 11.
// Prompt: AI_PROMPTS.md §5.
//
// POST { clientId, title?, hook?, platform?, format? } →
//   200 { captions: string[2] }      (1 when the retry could only make one clean caption)
//   400 { error: "bad_client" | "nothing_to_use" } · 404 { error: "no_client" }
//   429 { error: "rate_limited", retryAfter } · 502 { error: "ai_*" }
//
// Platform style: Instagram 3–6 short lines + a CTA + 3–5 hashtags at the end; TikTok 1–2 short lines
// + 2–4 hashtags; no platform yet: in between. 0–2 emoji. Context = the draft (title, hook, platform,
// format) + what works on that platform in the saved pull (top 5 openings, best format, top
// hashtags); works without a pull too. Health rules in the prompt AND the code red-flag list on every
// caption. Nothing is saved: the browser puts the chosen caption into Caption and the team saves.
// Who can call it: team only (verify_jwt → withSupabase → is_team()).

import {
  CAPTIONS_SCHEMA,
  captionContext,
  parseCaptionInput,
  todayContext,
  validateCaptions,
} from "../_shared/ai-logic.ts";
import { captionsSystem, captionsUser } from "../_shared/ai-prompts.ts";
import { aiFailure, groqJson, loadPull } from "../_shared/ai-server.ts";
import { json, readJson, requireTeam, withSupabase } from "../_shared/server.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const input = parseCaptionInput(await readJson(req));
    if ("error" in input) return json(input, 400);

    const loaded = await loadPull(ctx.supabase, input.clientId, { previous: false });
    if (!loaded.ok && loaded.error === "no_client") return json({ error: "no_client" }, 404);
    const works = loaded.ok
      ? captionContext(loaded.data, input.platform)
      : { note: "no competitor data yet" };
    const { data: client } = await ctx.supabase
      .from("clients")
      .select("name")
      .eq("id", input.clientId)
      .maybeSingle();

    const result = await groqJson({
      admin: ctx.supabaseAdmin,
      fn: "suggest-caption",
      system: captionsSystem({
        client: (client as { name: string } | null)?.name ?? "the client",
        platform: input.platform,
        today: todayContext().label,
      }),
      user: captionsUser({
        title: input.title,
        hook: input.hook,
        platform: input.platform,
        format: input.format,
        works,
      }),
      schema: CAPTIONS_SCHEMA,
      maxTokens: 1200,
      // First try needs 2 clean captions; the retry accepts 1.
      validate: (raw, attempt) => validateCaptions(raw, input.platform, attempt === 1 ? 2 : 1),
    });
    if (!result.ok) return aiFailure(result);
    return json({ captions: result.value });
  }),
};
