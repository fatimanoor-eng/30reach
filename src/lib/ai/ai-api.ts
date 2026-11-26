// Browser side of the AI Edge Functions (Slice 11). Types mirror supabase/functions/*/index.ts
// (kept in sync by hand). The browser never talks to Groq: it only calls our team-only functions.

import type { Platform } from "../platforms";
import { callFunction } from "../pulls/api";

/** UI copy from AI_PROMPTS.md › Errors (Blip's voice). Written here, never generated. */
export const AI_COPY = {
  rateLimited: "I need a quick breather. Groq asked me to slow down. Try again in a minute.",
  failed: "Something went wrong on my side. Nothing’s lost, want to try again?",
  noPull: "I need a saved pull to work from. Press Refresh on the Overview first.",
} as const;

export type AiErrorKind = "rate_limited" | "no_pull" | "failed";
export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    public retryAfter: number | null = null,
  ) {
    super(
      kind === "rate_limited"
        ? AI_COPY.rateLimited
        : kind === "no_pull"
          ? AI_COPY.noPull
          : AI_COPY.failed,
    );
  }
}

/** Calls a function; any non-200 becomes an AiError (429 → rate_limited, 409 no_pull → no_pull). */
async function call<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const res = await callFunction<T>(name, body);
  if (res.ok) return res.data;
  if (res.status === 429) {
    const wait = res.data?.retryAfter;
    throw new AiError("rate_limited", typeof wait === "number" ? wait : null);
  }
  if (res.status === 409 && res.data?.error === "no_pull") throw new AiError("no_pull");
  throw new AiError("failed");
}

export type SourcePost = {
  id: string;
  brand: string;
  platform: Platform;
  format: string | null;
  postedAt: string | null;
  url: string;
  likes: number | null;
  views: number | null;
};

// ───────────────────────────── ask-blip
export type AskTurn = { q: string; a: string };
export type BlipInsight = {
  type: "insight";
  lead: string;
  points: string[];
  forClient: string;
  /** forClient as plain idea text ("For OBU:" and emoji removed) for "Add idea to board". */
  idea: string;
  inData: boolean;
  sources: SourcePost[];
  pull: { id: string; startedAt: string };
  /** 0–3 next questions about this answer (Smart Blip round 1): the chips above the input. */
  followUps?: string[];
};
/** Small talk: one or two warm sentences, no sources, nothing to add to the board. */
export type BlipChat = {
  type: "chat";
  message: string;
  /** Starting points under the line (hesitation replies, written in code): tapping one asks it. */
  suggestions?: string[];
};
export type BlipAnswer = BlipInsight | BlipChat;

/** `light`: small talk, sent without the data summary (see isLightQuestion in blip-rules.ts). */
export const askBlip = (clientId: string, question: string, history: AskTurn[], light = false) =>
  call<BlipAnswer>("ask-blip", { clientId, question, history, ...(light && { light: true }) });

/** An answer as one short text: the history Blip gets for follow-ups, and what "Copy" copies. */
export function answerText(a: BlipAnswer): string {
  if (a.type === "chat") return a.message;
  return [a.lead, ...a.points.map((p, i) => `${i + 1}. ${p}`), a.forClient]
    .filter(Boolean)
    .join("\n");
}

// ───────────────────────────── plan-month
export type PlanEvent = { date: string; name: string; kind: "holiday" | "marketing" | "health" };
export type PlanSuggestion = {
  date: string;
  platform: Platform;
  format: string;
  title: string;
  reason: string;
  sources: SourcePost[];
};
export type PlanFacts = {
  events: number;
  bestFormat: string | null;
  bestTime: string | null;
  boardIdeas: number;
};
export type MonthPlan = { month: string; ideas: PlanSuggestion[]; facts: PlanFacts };
export const planMonth = (clientId: string, month: string, events: PlanEvent[]) =>
  call<MonthPlan>("plan-month", { clientId, month, events });

// ───────────────────────────── check-claims
export type ClaimIssue = { quote: string; why: string };
export type ClaimsResult = {
  status: "clear" | "flagged";
  issues: ClaimIssue[];
  hash: string;
  checkedAt: string;
};
export const checkClaims = (
  cardId: string,
  draft: { title: string; hook: string | null; caption: string | null; visualIdea: string | null },
) => call<ClaimsResult>("check-claims", { cardId, ...draft });

/** compliance_notes as saved by check-claims ({ v, hash, issues }); null if missing or unreadable. */
export function readComplianceNotes(notes: string | null | undefined): ClaimIssue[] | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { issues?: unknown };
    if (!Array.isArray(parsed.issues)) return null;
    return parsed.issues.filter(
      (i): i is ClaimIssue =>
        !!i && typeof i === "object" && typeof i.quote === "string" && typeof i.why === "string",
    );
  } catch {
    return null;
  }
}

// ───────────────────────────── suggest-hooks
export const suggestHooks = (
  clientId: string,
  draft: {
    title: string;
    caption: string | null;
    platform: Platform | null;
    format: string | null;
  },
) => call<{ hooks: string[] }>("suggest-hooks", { clientId, ...draft });

// ───────────────────────────── suggest-caption
/**
 * Two caption options in the platform's style (Instagram: lines + CTA + 3–5 hashtags; TikTok: short;
 * LinkedIn: professional, 3–8 lines + 2–3 hashtags).
 */
export const suggestCaption = (
  clientId: string,
  draft: {
    title: string;
    hook: string | null;
    platform: Platform | null;
    format: string | null;
  },
) => call<{ captions: string[] }>("suggest-caption", { clientId, ...draft });
