// `suggest-hooks` Edge Function: "Suggest hooks" in the card drawer (09 / M08), Slice 11.
// Prompt: AI_PROMPTS.md §4.
//
// POST { clientId, title?, caption?, platform?, format? } →
//   200 { hooks: string[3] }
//   400 { error: "bad_client" | "nothing_to_use" } · 429 { error: "rate_limited", retryAfter }
//   502 { error: "ai_*" }
//
// Context = the draft + a tiny "what works" slice of the saved pull (top 5 openings on that
// platform, best format). Works without a pull too (no competitor context). Health rules are in the
// prompt AND every hook goes through the code red-flag list (no second Groq call). Nothing is saved:
// the browser puts the chosen hook into the Hook field and the team saves the card as usual.
// Who can call it: team only (verify_jwt → withSupabase → is_team()).

import {
  HOOKS_SCHEMA,
  hookContext,
  parseHooksInput,
  todayContext,
  validateHooks,
} from "../_shared/ai-logic.ts";
import { hooksSystem, hooksUser } from "../_shared/ai-prompts.ts";
import { aiFailure, groqJson, loadPull } from "../_shared/ai-server.ts";
import { json, readJson, requireTeam, withSupabase } from "../_shared/server.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const input = parseHooksInput(await readJson(req));
    if ("error" in input) return json(input, 400);

    const loaded = await loadPull(ctx.supabase, input.clientId, { previous: false });
    if (!loaded.ok && loaded.error === "no_client") return json({ error: "no_client" }, 404);
    const works = loaded.ok
      ? hookContext(loaded.data, input.platform)
      : { note: "no competitor data yet" };
    const { data: client } = await ctx.supabase
      .from("clients")
      .select("name")
      .eq("id", input.clientId)
      .maybeSingle();

    const result = await groqJson({
      admin: ctx.supabaseAdmin,
      fn: "suggest-hooks",
      system: hooksSystem({
        client: (client as { name: string } | null)?.name ?? "the client",
        platform: input.platform,
        today: todayContext().label,
      }),
      user: hooksUser({ title: input.title, caption: input.caption, format: input.format, works }),
      schema: HOOKS_SCHEMA,
      maxTokens: 800,
      // First try needs 3 clean hooks; the retry accepts 2.
      validate: (raw, attempt) => validateHooks(raw, attempt === 1 ? 3 : 2),
    });
    if (!result.ok) return aiFailure(result);
    return json({ hooks: result.value });
  }),
};
