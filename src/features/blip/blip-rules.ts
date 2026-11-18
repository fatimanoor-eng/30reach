// Ask Blip (12 / M11) rules. Pure functions, tested in blip-rules.test.ts.

import {
  AiError,
  answerText,
  type AskTurn,
  type BlipAnswer,
  type SourcePost,
} from "../../lib/ai/ai-api";
import { formatCompact, formatShortDate } from "../../lib/format";

export const WHAT_CHANGED = "What changed since the last pull?";
export const MAX_QUESTION = 500;

/** "Fatima Noor" → "Fatima" (null if there's no name). */
export const firstNameOf = (fullName: string | null | undefined) =>
  fullName?.trim().split(/\s+/)[0] || null;

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

// ───────────────────────────── small talk answered in code (no Groq call)

export type SmallTalk = "greeting" | "thanks";
export type Energy = "calm" | "warm" | "hype";
export type SmallTalkMatch = {
  kind: SmallTalk;
  energy: Energy;
  /** The plain word they used ("hi", "thank you"). Hype greetings say it back. */
  word: string;
  /** Letters typed beyond the plain word ("hiiii" → 3), mirrored by hype replies. */
  stretch: number;
};

/** Every run of one letter → one letter ("hiiii" → "hi", "helloooo" → "helo"). */
export const squashRepeats = (s: string) => s.replace(/(\p{L})\1+/gu, "$1");

/** Emoji and their pieces (joiners, skin tones, variation selectors, flags). */
const EMOJI =
  /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\u{FE0F}|\u{200D}\p{Extended_Pictographic})*|\p{Regional_Indicator}{1,2}/gu;

/**
 * For matching only: lowercase, emoji / punctuation / symbols removed, spaces squished, repeated
 * letters squashed. "Heyyyy!! 👋" → "hey", "THANK   YOUUU" → "thank you".
 */
export function normaliseSmallTalk(text: string): string {
  const plain = text
    .toLowerCase()
    .replace(EMOJI, " ")
    .replace(/[\p{P}\p{S}\p{M}\u{200D}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return squashRepeats(plain);
}

/** The words, written squashed like normaliseSmallTalk() leaves them ("hello" → "helo"). */
const WORDS: Record<string, { kind: SmallTalk; word: string }> = Object.fromEntries(
  (
    [
      ["hi", "greeting"],
      ["hey", "greeting"],
      ["hello", "greeting"],
      ["yo", "greeting"],
      ["hiya", "greeting"],
      ["thanks", "thanks"],
      ["thank you", "thanks"],
      ["ty", "thanks"],
      ["thx", "thanks"],
    ] as const
  ).map(([word, kind]) => [squashRepeats(word), { kind, word }]),
);

/**
 * calm / warm / hype from letter stretching, "!" count, CAPS and emoji.
 * Hype: CAPS, 2+ stretched letters, "!!" or 2+ emoji, or several small signals together.
 */
export function smallTalkEnergy(text: string, stretch: number): Energy {
  const bangs = (text.match(/!/g) ?? []).length;
  const emoji = (text.match(EMOJI) ?? []).length;
  const letters = text.replace(/[^\p{L}]/gu, "");
  const caps = letters.length >= 2 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters);
  if (caps || stretch >= 2 || bangs >= 2 || emoji >= 2) return "hype";
  const signals = (stretch > 0 ? 1 : 0) + (bangs > 0 ? 1 : 0) + (emoji > 0 ? 1 : 0);
  return signals >= 3 ? "hype" : signals >= 1 ? "warm" : "calm";
}

/**
 * A message that is only a greeting (hi, hey, hello, yo, hiya) or thanks (thanks, thank you, ty,
 * thx), after normalising. Anything else, including typos this doesn't catch, goes to Groq.
 */
export function matchSmallTalk(text: string): SmallTalkMatch | null {
  if (/\p{N}/u.test(text)) return null; // "hi 2" isn't small talk
  const hit = WORDS[normaliseSmallTalk(text)];
  if (!hit) return null;
  const typed = text.replace(/[^\p{L}]/gu, "").length;
  const stretch = Math.max(0, typed - hit.word.replace(/\s/g, "").length);
  return { kind: hit.kind, word: hit.word, energy: smallTalkEnergy(text, stretch), stretch };
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
/** "Hi" stretched like the person typed it, 2–5 extra letters ("Hiiii"). */
const stretchy = (word: string, stretch: number) =>
  word + word.slice(-1).repeat(Math.min(5, Math.max(2, stretch)));

type Line = (name: string | null, stretch: number, word: string) => string;
const named = (word: string, name: string | null, end = "!") =>
  name ? `${word} ${name}${end}` : `${word}${end}`;
const after = (word: string, name: string | null, end = "!") =>
  name ? `${word}, ${name}${end}` : `${word}${end}`;

/** Blip's voice, 1–2 emoji, ending with a nudge back to the data. Rotated per kind. */
export const SMALL_TALK_LINES: Record<SmallTalk, Record<Energy, Line[]>> = {
  greeting: {
    calm: [
      (n) => `${named("Hi", n, ".")} 👋 What should we look at today?`,
      (n) => `${named("Hello", n, ".")} 🙂 Ask me about any brand, format or post.`,
      (n) => `${named("Hey", n, ".")} 👋 Want to see what changed since the last pull?`,
    ],
    warm: [
      (n) =>
        `${named("Hey", n)} 👋 Ready when you are. Want to see what changed since the last pull?`,
      (n) => `${named("Hi", n)} ✨ Good to see you. What should we dig into?`,
      (n) => `${named("Hello", n)} 🙌 Ask me about any brand, format or post.`,
    ],
    hype: [
      (n, s, w) =>
        `${named(stretchy(cap(w), s), n)} 🚀 Love the energy. Want the top post from this pull?`,
      (n, s, w) =>
        `${named(stretchy(cap(w), s), n)} 🙌 Let’s find something good. Who should we look at first?`,
      (n, s, w) =>
        `${named(stretchy(cap(w), s), n)} ✨ Ready to dig in? What changed since the last pull is a fun start.`,
    ],
  },
  thanks: {
    calm: [
      (n) => `${after("Anytime", n, ".")} 🙂 Shout if you want to look at anything else.`,
      (n) => `${after("Happy to help", n, ".")} 👍 I’m here for the next question.`,
      (n) => `${after("You’re welcome", n, ".")} 🙂 Want 3 post ideas from this pull next?`,
    ],
    warm: [
      (n) => `${after("Anytime", n)} 🙌 Shout if you want to dig into anything else.`,
      (n) => `${after("Happy to help", n)} ✨ I’m here when the next question pops up.`,
      (n) => `${after("You got it", n)} 🎯 Want 3 post ideas from this pull next?`,
    ],
    hype: [
      (n, s) => `${after(stretchy("Yes", s), n)} 🙌 We make a good team. What’s next?`,
      (n, s) => `${after(stretchy("Anytime", s), n)} 🚀 Want 3 post ideas while we’re on a roll?`,
      (n) => `${after("Love that", n)} 🎉 Let’s keep going, which brand next?`,
    ],
  },
};

/** The `turn`-th reply of this kind in the thread (0, 1, 2, … wraps around). */
export function smallTalkReply(m: SmallTalkMatch, firstName: string | null, turn: number): string {
  const lines = SMALL_TALK_LINES[m.kind][m.energy];
  return lines[turn % lines.length](firstName, m.stretch, m.word);
}

// ───────────────────────────── light mode (no data summary sent)

export const LIGHT_MAX_CHARS = 40; // same as LIMITS.lightChars in the ask-blip function

/**
 * Words that mean the question is about the data: platforms, formats, metrics and research words.
 * Matched as whole words with an optional plural ("posts", "reels"). Erring towards the full mode
 * only costs tokens; erring towards light mode gets "ask me a data question" back.
 */
const DATA_WORDS = new RegExp(
  String.raw`\b(?:${[
    "instagram",
    "insta",
    "ig",
    "tiktok",
    "tik tok",
    "reel",
    "carousel",
    "image",
    "photo",
    "video",
    "story",
    "stories",
    "format",
    "post",
    "posting",
    "like",
    "comment",
    "view",
    "follower",
    "share",
    "engagement",
    "engage",
    "reach",
    "caption",
    "hook",
    "hashtag",
    "compare",
    "comparison",
    "vs",
    "versus",
    "idea",
    "trend",
    "trending",
    "best",
    "top",
    "worst",
    "most",
    "least",
    "average",
    "avg",
    "stat",
    "stats",
    "data",
    "number",
    "chart",
    "pull",
    "competitor",
    "brand",
    "change",
    "changed",
    "new",
    "growth",
    "grow",
    "perform",
    "performing",
    "performance",
    "working",
    "winning",
    "time",
    "week",
    "month",
    "calendar",
    "plan",
    "content",
  ].join("|")})s?\b`,
  "i",
);

/**
 * Small talk that can skip the data summary (~400 tokens instead of ~3K): at most 40 characters,
 * no digits, no brand or client names, no data words. Pure greetings / thanks never get here
 * (they're answered in code). Goes light: "hehehe", "huh?", "do you love me?", "I'm so tired".
 */
export function isLightQuestion(text: string, names: string[]): boolean {
  const t = text.trim();
  if (!t || t.length > LIGHT_MAX_CHARS || /\d/.test(t)) return false;
  if (DATA_WORDS.test(t)) return false;
  const lower = t.toLowerCase();
  return !names.some((name) => {
    const n = name.trim().toLowerCase();
    const first = n.split(/\s+/)[0];
    return (n && lower.includes(n)) || (first.length >= 3 && lower.includes(first));
  });
}

// ───────────────────────────── one automatic retry after a 429

export const BREATHER_CAP_S = 30;
export const BREATHER_TEXT = "One sec, catching my breath…";

/** Seconds to wait before the one automatic retry: Groq's Retry-After, 1–30 s (30 if unknown). */
export const breatherWait = (retryAfter: number | null) =>
  Math.min(BREATHER_CAP_S, Math.max(1, Math.ceil(retryAfter ?? BREATHER_CAP_S)));

/**
 * Runs `run`; on a rate limit, calls `onWait(seconds)`, waits, and runs it ONCE more. A second rate
 * limit (or any other error) is thrown, and the panel shows the breather / error message.
 */
export async function withBreather<T>(
  run: () => Promise<T>,
  o: { onWait: (seconds: number) => void; sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof AiError) || err.kind !== "rate_limited") throw err;
    const seconds = breatherWait(err.retryAfter);
    o.onWait(seconds);
    await sleep(seconds * 1000);
    return run();
  }
}

export type Message =
  | {
      id: number;
      question: string;
      status: "pending";
      /** Waiting out a rate limit before the one automatic retry ("One sec, catching my breath…"). */
      breather?: boolean;
    }
  | {
      id: number;
      question: string;
      status: "done";
      answer: BlipAnswer;
      /** Answered in code (small talk): not sent back to Groq as history. */
      local?: SmallTalk;
    }
  | { id: number; question: string; status: "error"; kind: "rate_limited" | "no_pull" | "failed" };

/** The last 2 answered turns from Groq, sent with a new question so follow-ups make sense. */
export function historyFrom(messages: Message[]): AskTurn[] {
  return messages
    .filter((m): m is Extract<Message, { status: "done" }> => m.status === "done" && !m.local)
    .slice(-2)
    .map((m) => ({ q: m.question, a: answerText(m.answer) }));
}
