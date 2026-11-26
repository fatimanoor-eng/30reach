// `ask-blip` Edge Function: Ask Blip (12 / M11), Slice 11. Prompt: AI_PROMPTS.md §1.
//
// POST { clientId, question, history?: [{ q, a }], light?: boolean } →
//   200 { type: "insight", lead, points[], forClient, idea, inData, sources: SourcePost[],
//         pull: { id, startedAt } }
//   200 { type: "chat", message }             small talk: greetings, hype, thanks, feelings, off-topic
//                                             (bare "hi" / "thanks" are answered in the browser, no call)
//   400 { error: "bad_client" | "empty_question" | "question_too_long" }
//   409 { error: "no_pull" }                 nothing to answer from yet (Groq isn't called)
//   429 { error: "rate_limited", retryAfter } Groq asked us to slow down
//   502 { error: "ai_invalid" | "ai_unavailable" }
//
// Light mode (light: true, question ≤ 40 chars; the browser decides with isLightQuestion()): small talk
// with no data words. The pull isn't loaded or sent: persona + rules + last turns only (~400 tokens
// instead of ~3K), and the answer is always { type: "chat", message }.
//
// The model never sees the raw pull: only the compact summary from buildSummary() (≈ 2.5K tokens),
// with posts as p1…pN. History is the last 2 turns, trimmed. Nothing is stored.
// Who can call it: team only (verify_jwt → withSupabase → is_team()), same as `credits`.

import {
  ASK_LIGHT_SCHEMA,
  ASK_SCHEMA,
  buildSummary,
  firstName,
  parseAskInput,
  repeatsLast,
  todayContext,
  validateAskAnswer,
  validateLightAnswer,
} from "../_shared/ai-logic.ts";
import { askLightSystem, askLightUser, askSystem, askUser } from "../_shared/ai-prompts.ts";
import {
  aiFailure,
  groqJson,
  insightResponse,
  loadClientContext,
  loadFailure,
  loadPull,
} from "../_shared/ai-server.ts";
import { json, readJson, requireTeam, withSupabase } from "../_shared/server.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const input = parseAskInput(await readJson(req));
    if ("error" in input) return json(input, 400);

    const today = todayContext().label;
    const userId = ctx.userClaims?.sub;
    const profileQuery = userId
      ? ctx.supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle()
      : Promise.resolve({ data: null });

    if (input.light) {
      const [client, profile] = await Promise.all([
        loadClientContext(ctx.supabase, input.clientId),
        profileQuery,
      ]);
      if (!client) return loadFailure("no_client");
      const who = profile.data as { full_name: string | null; email: string } | null;
      const result = await groqJson({
        admin: ctx.supabaseAdmin,
        fn: "ask-blip",
        clientId: input.clientId,
        actor: ctx.userClaims?.sub ?? null,
        label: "ask-blip light",
        system: askLightSystem({
          client: client.name,
          firstName: firstName(who?.full_name, who?.email),
          today,
          ctx: client,
        }),
        user: askLightUser({ history: input.history, question: input.question }),
        schema: ASK_LIGHT_SCHEMA,
        maxTokens: 400,
        validate: (raw, attempt) => {
          const a = validateLightAnswer(raw);
          return a && attempt === 1 && repeatsLast(a, input.history) ? null : a;
        },
      });
      if (!result.ok) return aiFailure(result);
      return json(result.value);
    }

    const [loaded, profile, clientCtx] = await Promise.all([
      loadPull(ctx.supabase, input.clientId, { previous: true }),
      profileQuery,
      loadClientContext(ctx.supabase, input.clientId),
    ]);
    if (!loaded.ok) return loadFailure(loaded.error);

    const { refs, labels, json: summaryJson } = buildSummary(loaded.data);
    const who = profile.data as { full_name: string | null; email: string } | null;
    const client = loaded.data.clientName;

    const result = await groqJson({
      admin: ctx.supabaseAdmin,
      fn: "ask-blip",
      clientId: input.clientId,
      actor: ctx.userClaims?.sub ?? null,
      label: "ask-blip full",
      system: askSystem({
        client,
        firstName: firstName(who?.full_name, who?.email),
        today,
        ctx: clientCtx ?? undefined,
      }),
      user: askUser({ summaryJson, history: input.history, question: input.question }),
      schema: ASK_SCHEMA,
      // Reasoning over the ~2.5K-token summary counts here too; 1,500 could run out before the JSON
      // was finished (Groq 400). ~3K in + 3K max stays under the 8K tokens/minute.
      maxTokens: 3000,
      // Refs become "Ro’s reel from 9 Nov" (or go) in every text field.
      // A repeat of the last answer gets one more try; the second answer is kept either way.
      validate: (raw, attempt) => {
        const a = validateAskAnswer(raw, refs, labels);
        return a && attempt === 1 && repeatsLast(a, input.history) ? null : a;
      },
    });
    if (!result.ok) return aiFailure(result);

    const a = result.value;
    if (a.type === "chat") return json(a);
    return json(insightResponse(a, loaded, client));
  }),
};
