// `ask-blip` Edge Function: Ask Blip (12 / M11), Slice 11. Prompt: AI_PROMPTS.md §1.
//
// POST { clientId, question, history?: [{ q, a }] } →
//   200 { type: "insight", lead, points[], forClient, idea, inData, sources: SourcePost[],
//         pull: { id, startedAt } }
//   200 { type: "chat", message }             small talk: greetings, hype, thanks, feelings, off-topic
//                                             (bare "hi" / "thanks" are answered in the browser, no call)
//   400 { error: "bad_client" | "empty_question" | "question_too_long" }
//   409 { error: "no_pull" }                 nothing to answer from yet (Groq isn't called)
//   429 { error: "rate_limited", retryAfter } Groq asked us to slow down
//   502 { error: "ai_invalid" | "ai_unavailable" }
//
// The model never sees the raw pull: only the compact summary from buildSummary() (≈ 2.5K tokens),
// with posts as p1…pN. History is the last 2 turns, trimmed. Nothing is stored.
// Who can call it: team only (verify_jwt → withSupabase → is_team()), same as `credits`.

import {
  ASK_SCHEMA,
  buildSummary,
  firstName,
  ideaFromAnswer,
  parseAskInput,
  validateAskAnswer,
} from "../_shared/ai-logic.ts";
import { askSystem, askUser } from "../_shared/ai-prompts.ts";
import { aiFailure, groqJson, loadFailure, loadPull, sourcePost } from "../_shared/ai-server.ts";
import { json, readJson, requireTeam, withSupabase } from "../_shared/server.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const input = parseAskInput(await readJson(req));
    if ("error" in input) return json(input, 400);

    const userId = ctx.userClaims?.sub;
    const [loaded, profile] = await Promise.all([
      loadPull(ctx.supabase, input.clientId, { previous: true }),
      userId
        ? ctx.supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!loaded.ok) return loadFailure(loaded.error);

    const { refs, json: summaryJson } = buildSummary(loaded.data);
    const who = profile.data as { full_name: string | null; email: string } | null;
    const client = loaded.data.clientName;

    const result = await groqJson({
      admin: ctx.supabaseAdmin,
      fn: "ask-blip",
      system: askSystem({ client, firstName: firstName(who?.full_name, who?.email) }),
      user: askUser({ summaryJson, history: input.history, question: input.question }),
      schema: ASK_SCHEMA,
      maxTokens: 1500,
      validate: (raw) => validateAskAnswer(raw, refs),
    });
    if (!result.ok) return aiFailure(result);

    const a = result.value;
    if (a.type === "chat") return json({ type: "chat", message: a.message });
    return json({
      type: "insight",
      lead: a.lead,
      points: a.points,
      forClient: a.forClient,
      idea: ideaFromAnswer(a.forClient, client),
      inData: a.inData,
      sources: a.postIds
        .map((id) => loaded.posts.get(id))
        .filter((p) => !!p)
        .map((p) => sourcePost(p!, loaded.data.brands)),
      pull: { id: loaded.data.pull.id, startedAt: loaded.data.pull.started_at },
    });
  }),
};
