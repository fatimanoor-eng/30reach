// `check-claims` Edge Function: health-claim check on Save (09 / M08), Slice 11. AI_PROMPTS.md §3.
//
// POST { cardId, title?, hook?, caption?, visualIdea? } →
//   200 { status: "clear" | "flagged", issues: [{ quote, why }], hash, checkedAt }
//   400 { error: "bad_card" | "nothing_to_check" } · 404 { error: "no_card" }
//   429 { error: "rate_limited", retryAfter } · 502 { error: "ai_*" }
//
// Advisory only: the card is ALREADY saved by the browser before this runs; a failure here never
// blocks anything ("Couldn't check this time"). The result is stored on the card
// (compliance_status + compliance_notes = { v, hash, issues }) so the drawer can tell whether the
// text changed since the last check. Quotes are kept only if they're really in the draft, and a
// small code list of red flags always runs too (ai-logic.ts healthRedFlags).
// Who can call it: team only (verify_jwt → withSupabase → is_team()). Writes go through the
// caller's RLS (calendar_cards is team-editable).

import { CLAIMS_SCHEMA, parseClaimsInput, textHash, validateClaims } from "../_shared/ai-logic.ts";
import { claimsSystem, claimsUser } from "../_shared/ai-prompts.ts";
import { aiFailure, groqJson } from "../_shared/ai-server.ts";
import { json, readJson, requireTeam, withSupabase } from "../_shared/server.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await requireTeam(ctx);
    if (denied) return denied;

    const input = parseClaimsInput(await readJson(req));
    if ("error" in input) return json(input, 400);

    const { data: card } = await ctx.supabase
      .from("calendar_cards")
      .select("id")
      .eq("id", input.cardId)
      .maybeSingle();
    if (!card) return json({ error: "no_card" }, 404);

    const result = await groqJson({
      admin: ctx.supabaseAdmin,
      fn: "check-claims",
      system: claimsSystem(),
      user: claimsUser(input.draft),
      schema: CLAIMS_SCHEMA,
      maxTokens: 1200,
      validate: (raw) => validateClaims(raw, input.draft),
    });
    if (!result.ok) return aiFailure(result);

    const hash = textHash(input.draft);
    const { status, issues } = result.value;
    const { error } = await ctx.supabase
      .from("calendar_cards")
      .update({
        compliance_status: status,
        compliance_notes: JSON.stringify({ v: 1, hash, issues }),
      })
      .eq("id", input.cardId);
    if (error) console.error(`check-claims: save failed (${error.code ?? "unknown"})`);

    return json({ status, issues, hash, checkedAt: new Date().toISOString() });
  }),
};
