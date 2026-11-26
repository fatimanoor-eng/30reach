// Ask Blip (12 / M11) rules. Pure functions, tested in blip-rules.test.ts.

import {
  AiError,
  answerText,
  type AskTurn,
  type BlipAnswer,
  type SourcePost,
} from "../../lib/ai/ai-api";
import { formatCompact, formatShortDate } from "../../lib/format";
import { PLATFORM_NAME } from "../../lib/platforms";

export const WHAT_CHANGED = "What changed since the last pull?";
export const MAX_QUESTION = 500;

/** "Fatima Noor" → "Fatima" (null if there's no name). */
export const firstNameOf = (fullName: string | null | undefined) =>
  fullName?.trim().split(/\s+/)[0] || null;

/** Trailing words a client's short name drops ("OBU Health" → "OBU", "All The Best Co" → "All The Best"). */
const COMPANY_WORDS = /^(health|co|company|inc|llc|ltd|limited|group|corp|corporation)\.?$/i;

/**
 * "OBU Health" → "OBU" (Figma: "Ask about OBU’s competitors…", "3 post ideas for OBU"). Drops trailing
 * company words only, so a multi-word name stays readable ("All The Best Co" → "All The Best", never "All").
 */
export function clientShort(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && COMPANY_WORDS.test(words.at(-1)!)) words.pop();
  return words.join(" ") || name;
}

/**
 * Suggestion chips. "Explain this chart" (Figma) is swapped for "What changed since the last pull?":
 * Blip can't see which chart is on screen. The brand chip names the brand with the most engagement.
 */
/**
 * The chips above the input (Smart Blip round 1): the latest answer's follow-ups when it has some,
 * otherwise the usual starters.
 */
export function chipsFor(messages: Message[], starters: string[]): string[] {
  const last = [...messages].reverse().find((m) => m.status === "done");
  const next =
    last?.status === "done" && last.answer.type === "insight" ? (last.answer.followUps ?? []) : [];
  return next.length ? next : starters;
}

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

/**
 * "Hims · TikTok · 9 Nov · 212K views" (views when there are any, else likes; LinkedIn / Facebook:
 * reactions, "Hims · LinkedIn · 2 Nov · 700 reactions").
 */
export function sourceLabel(s: SourcePost): string {
  const metric =
    s.views != null
      ? `${formatCompact(s.views)} views`
      : s.likes != null
        ? `${formatCompact(s.likes)} ${s.platform === "linkedin" || s.platform === "facebook" ? "reactions" : "likes"}`
        : null;
  return [s.brand, PLATFORM_NAME[s.platform], formatShortDate(s.postedAt), metric]
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

// ───────────────────────────── hesitation and "how do you work?" (answered in code, no Groq call)

export type HelpTalk = "hesitation" | "how";

/** Normalised like small talk (lowercase, no punctuation / emoji, repeats squashed). */
const HELP: Record<string, HelpTalk> = Object.fromEntries(
  (
    [
      ...[
        "um",
        "umm",
        "hm",
        "hmm",
        "uh",
        "uhm",
        "erm",
        "eh",
        "idk",
        "i dont know",
        "i don't know",
        "dunno",
        "i dunno",
        "not sure",
        "im not sure",
        "i'm not sure",
        "no idea",
        "no clue",
        "idk what to ask",
        "not sure what to ask",
        "what should i ask",
        "where do i start",
      ].map((w) => [w, "hesitation"] as const),
      ...[
        "how do you work",
        "how does this work",
        "how does blip work",
        "how does 30reach work",
        "how do you know",
        "how do you get your data",
        "how do you get data",
        "where does your data come from",
        "where do you get your data",
        "where do you get your info",
        "what data do you use",
        "what can you do",
        "what do you do",
        "what are you",
        "who are you",
        "what can i ask",
        "what can i ask you",
        "are you online",
        "can you browse the web",
        "can you search the web",
        "can you search the internet",
        "do you have internet",
        "do you have internet access",
        "are you connected to the internet",
      ].map((w) => [w, "how"] as const),
    ] as const
  ).map(([w, kind]) => [normaliseSmallTalk(w), kind]),
);

/** Hesitation ("ummm", "idk", "not sure") or "how do you work?" said on its own; null otherwise. */
export function matchHelpTalk(text: string): HelpTalk | null {
  return HELP[normaliseSmallTalk(text)] ?? null;
}

const HESITATION_LINES = [
  "No worries, let’s start easy. Pick one 👇",
  "All good, I’ll get us going. Try one of these 👇",
  "Happens to the best of us 🙂 Start here:",
];

/** A hesitation reply in Blip's voice with two starting points (tappable chips). Rotates. */
export function hesitationReply(
  chips: string[],
  turn: number,
): { message: string; suggestions: string[] } {
  return {
    message: HESITATION_LINES[turn % HESITATION_LINES.length],
    suggestions: chips.slice(0, 2),
  };
}

/** One line on how Blip works: it reads the saved pull; no live internet. */
export function howReply(pull: { date: string; posts: number; brands: number } | null): string {
  if (!pull)
    return "I read the saved pull, and there isn’t one yet. Press Refresh on the Overview to make one.";
  const posts = pull.posts === 1 ? "1 post" : `${pull.posts.toLocaleString("en-US")} posts`;
  const brands = pull.brands === 1 ? "1 brand" : `${pull.brands} brands`;
  return `I read the saved pull from ${pull.date}: ${posts} from ${brands}. No live internet, so press Refresh on the Overview for newer posts.`;
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
    "linkedin",
    "facebook",
    "fb",
    "x",
    "twitter",
    "tweet",
    "youtube",
    "yt",
    "shorts",
    "album",
    "repost",
    "reaction",
    "document",
    "poll",
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

// ───────────────────────────── typing dots and word-by-word reveal

/** Reveal speed (within the 35–45 words/s asked for). */
export const REVEAL_WPS = 40;

const WORD = /\S+\s*/g;
/** Number of words in a text. */
export const wordCount = (text: string) => text.match(WORD)?.length ?? 0;

/**
 * The visible part of each segment once `shown` words have been revealed, across all segments in
 * order (lead, points, "For {client}:"). Segments not reached yet are "" (not rendered at all).
 */
export function revealSegments(segments: string[], shown: number): string[] {
  let left = Math.max(0, shown);
  return segments.map((seg) => {
    const words = seg.match(WORD) ?? [];
    const take = Math.min(words.length, left);
    left -= take;
    return words.slice(0, take).join("").trimEnd();
  });
}

/** How long a code reply "types" before it appears: 400–700 ms, randomised. */
export const typingDelay = (rand: () => number = Math.random) =>
  400 + Math.round(Math.min(1, Math.max(0, rand())) * 300);

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
      /** New answer still to be revealed word by word (cleared when the reveal ends or is skipped). */
      animate?: boolean;
      /** Answered in code (small talk, hesitation, "how do you work"): not sent back to Groq. */
      local?: SmallTalk | HelpTalk;
    }
  | { id: number; question: string; status: "error"; kind: "rate_limited" | "no_pull" | "failed" };

/**
 * The last answered turns from Groq (up to 6, Smart Blip round 1), sent with a new question so follow-ups
 * make sense. The server trims them to its token budget (older answers keep their first line).
 */
export const HISTORY_TURNS = 6;
export function historyFrom(messages: Message[]): AskTurn[] {
  return messages
    .filter((m): m is Extract<Message, { status: "done" }> => m.status === "done" && !m.local)
    .slice(-HISTORY_TURNS)
    .map((m) => ({ q: m.question, a: answerText(m.answer) }));
}
