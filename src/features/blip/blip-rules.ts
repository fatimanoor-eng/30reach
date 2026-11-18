// Ask Blip (12 / M11) rules. Pure functions, tested in blip-rules.test.ts.

import { answerText, type AskTurn, type BlipAnswer, type SourcePost } from "../../lib/ai/ai-api";
import { formatCompact, formatShortDate } from "../../lib/format";

export const WHAT_CHANGED = "What changed since the last pull?";
export const MAX_QUESTION = 500;

/** "OBU Health" → "OBU" (Figma: "Ask about OBU’s competitors…", "3 post ideas for OBU"). */
export const clientShort = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Suggestion chips. "Explain this chart" (Figma) is swapped for "What changed since the last pull?":
 * Blip can't see which chart is on screen. The brand chip names the brand with the most engagement.
 */
export function suggestions(clientName: string, topBrand: string | null): string[] {
  return [
    WHAT_CHANGED,
    ...(topBrand ? [`What’s working for ${topBrand}?`] : []),
    `Give me 3 post ideas for ${clientShort(clientName)}`,
  ];
}

/** The leaderboard's #1: best average likes + comments per post (null if no posts). */
export function topBrand(
  posts: {
    competitor_id: string;
    likes: number | null;
    comments: number | null;
    counts_hidden: boolean;
  }[],
  brands: { id: string; name: string }[],
): string | null {
  const sums = new Map<string, { total: number; n: number }>();
  for (const p of posts) {
    if (p.counts_hidden) continue;
    const s = sums.get(p.competitor_id) ?? { total: 0, n: 0 };
    sums.set(p.competitor_id, { total: s.total + (p.likes ?? 0) + (p.comments ?? 0), n: s.n + 1 });
  }
  const best = [...sums].sort((a, b) => b[1].total / b[1].n - a[1].total / a[1].n)[0];
  return best ? (brands.find((b) => b.id === best[0])?.name ?? null) : null;
}

/** The voice guide's greeting, written by code (no Groq call just to say hi). */
export function greeting(o: {
  firstName: string | null;
  pullStartedAt: string;
  posts: number;
  brands: number;
}): string {
  const hi = o.firstName ? `Hey ${o.firstName}! 👋` : "Hey! 👋";
  const date = formatShortDate(o.pullStartedAt);
  const brands = o.brands === 1 ? "1 brand" : `${o.brands} brands`;
  const posts = o.posts === 1 ? "1 post" : `${o.posts} posts`;
  return `${hi} I’ve read the ${date} pull, ${posts} from ${brands}. What should we dig into?`;
}

const PLATFORM: Record<SourcePost["platform"], string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** "Hims · TikTok · 9 Nov · 212K views" (views when there are any, else likes). */
export function sourceLabel(s: SourcePost): string {
  const metric =
    s.views != null
      ? `${formatCompact(s.views)} views`
      : s.likes != null
        ? `${formatCompact(s.likes)} likes`
        : null;
  return [s.brand, PLATFORM[s.platform], formatShortDate(s.postedAt), metric]
    .filter(Boolean)
    .join(" · ");
}

export type Message =
  | { id: number; question: string; status: "pending" }
  | { id: number; question: string; status: "done"; answer: BlipAnswer }
  | { id: number; question: string; status: "error"; kind: "rate_limited" | "no_pull" | "failed" };

/** The last 2 answered turns, sent with a new question so follow-ups make sense. */
export function historyFrom(messages: Message[]): AskTurn[] {
  return messages
    .filter((m): m is Extract<Message, { status: "done" }> => m.status === "done")
    .slice(-2)
    .map((m) => ({ q: m.question, a: answerText(m.answer) }));
}
