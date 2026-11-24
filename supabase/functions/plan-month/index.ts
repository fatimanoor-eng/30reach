// `plan-month` Edge Function: Plan {month} (10), Slice 11. Prompt: AI_PROMPTS.md §2.
//
// POST { clientId, month: "YYYY-MM", events: [{ date, name, kind }] } →
//   200 { month, ideas: [{ date, platform, format, title, reason, sources: SourcePost[] }], facts }
//   400 { error: "bad_client" | "bad_month" }   this month … 3 months ahead
//   409 { error: "no_pull" } · 429 { error: "rate_limited", retryAfter } · 502 { error: "ai_*" }
//
// Events come from the browser: they're computed by the calendar's code rules + the Nager cache
// (CALENDAR_EVENTS.md), never by AI. The model only SUGGESTS: nothing is written here. The browser
// saves the ideas the team ticks as `ideas` rows with kind 'ai'; they become Idea cards only when a
// person presses "Add to calendar as Ideas" / "Plan on {date}" (rule 6). Nothing is automatic.
// `facts` (the "30reach looked at" chips) are computed in code, not by the model.
// Who can call it: team only (verify_jwt → withSupabase → is_team()).

import {
  buildSummary,
  clip,
  LIMITS,
  PLAN_SCHEMA,
  parsePlanInput,
  planFacts,
  todayContext,
  validatePlan,
} from "../_shared/ai-logic.ts";
import { planSystem, planUser } from "../_shared/ai-prompts.ts";
import { aiFailure, groqJson, loadFailure, loadPull, sourcePost } from "../_shared/ai-server.ts";
import { json, readJson, requireTeam, withSupabase } from "../_shared/server.ts";

const MONTH_NAME = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    // Today in US Eastern: the team plans in Eastern time.
    const { iso: today, label: todayLabel } = todayContext();
    const input = parsePlanInput(await readJson(req), today);
    if ("error" in input) return json(input, 400);

    const [loaded, board] = await Promise.all([
      loadPull(ctx.supabase, input.clientId, { previous: false }),
      ctx.supabase
        .from("ideas")
        .select("note, platform, format")
        .eq("client_id", input.clientId)
        .is("planned_card_id", null)
        .not("note", "is", null)
        .order("created_at", { ascending: false })
        .limit(LIMITS.boardIdeas),
    ]);
    if (!loaded.ok) return loadFailure(loaded.error);

    const boardIdeas = (
      (board.data ?? []) as { note: string; platform: string | null; format: string | null }[]
    )
      .map((i) => ({ ...i, note: clip(i.note, LIMITS.ideaNoteChars) }))
      .filter((i) => i.note);
    const { refs, labels, json: summaryJson } = buildSummary(loaded.data);
    const [year, month] = input.month.split("-").map(Number);
    const monthName = MONTH_NAME.format(new Date(Date.UTC(year, month - 1, 1)));

    const result = await groqJson({
      admin: ctx.supabaseAdmin,
      fn: "plan-month",
      clientId: input.clientId,
      actor: ctx.userClaims?.sub ?? null,
      system: planSystem({ client: loaded.data.clientName, monthName, year, today: todayLabel }),
      user: planUser({ summaryJson, events: input.events, boardIdeas }),
      schema: PLAN_SCHEMA,
      maxTokens: 2500,
      // First try needs 4+ good ideas; the retry accepts 3.
      validate: (raw, attempt) =>
        validatePlan(raw, {
          month: input.month,
          today,
          refs,
          labels,
          min: attempt === 1 ? 4 : 3,
        }),
    });
    if (!result.ok) return aiFailure(result);

    return json({
      month: input.month,
      ideas: result.value.map((i) => ({
        date: i.date,
        platform: i.platform,
        format: i.format,
        title: i.title,
        reason: i.reason,
        sources: i.sourcePostIds
          .map((id) => loaded.posts.get(id))
          .filter((p) => !!p)
          .map((p) => sourcePost(p!, loaded.data.brands)),
      })),
      facts: planFacts(loaded.data.posts, input.events.length, boardIdeas.length),
    });
  }),
};
