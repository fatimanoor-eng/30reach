import { describe, expect, it } from "vitest";
import type { BlipAnswer, BlipInsight, SourcePost } from "../../lib/ai/ai-api";
import { answerText } from "../../lib/ai/ai-api";
import {
  clientShort,
  firstNameOf,
  greeting,
  historyFrom,
  type Message,
  matchSmallTalk,
  normaliseSmallTalk,
  SMALL_TALK_LINES,
  smallTalkEnergy,
  smallTalkReply,
  squashRepeats,
  sourceLabel,
  suggestions,
  topBrand,
  WHAT_CHANGED,
} from "./blip-rules";

const source = (o: Partial<SourcePost> = {}): SourcePost => ({
  id: "p1",
  brand: "Hims",
  platform: "tiktok",
  format: "video",
  postedAt: "2026-11-09T12:00:00Z",
  url: "https://example.com/p1",
  likes: 9800,
  views: 212000,
  ...o,
});
const answer = (lead: string): BlipInsight => ({
  type: "insight",
  lead,
  points: ["a", "b"],
  forClient: "For OBU: try it",
  idea: "Try it",
  inData: true,
  sources: [],
  pull: { id: "pull", startedAt: "2026-11-17T12:00:00Z" },
});

describe("Ask Blip rules", () => {
  it("shortens the client name like Figma ('OBU')", () => {
    expect(clientShort("OBU Health")).toBe("OBU");
  });

  it("chips: what changed first, the top brand, then post ideas", () => {
    expect(suggestions("OBU Health", "Hers")).toEqual([
      WHAT_CHANGED,
      "What’s working for Hers?",
      "Give me 3 post ideas for OBU",
    ]);
    expect(suggestions("OBU Health", null)).toHaveLength(2);
  });

  it("top brand = best average likes + comments (like the leaderboard), ignoring hidden counts", () => {
    const brands = [
      { id: "a", name: "Hims" },
      { id: "b", name: "Hers" },
    ];
    const posts = [
      { competitor_id: "a", likes: 100, comments: 5, counts_hidden: false },
      { competitor_id: "b", likes: 90, comments: 10, counts_hidden: false },
      { competitor_id: "b", likes: 9999, comments: 0, counts_hidden: true },
      { competitor_id: "b", likes: 20, comments: null, counts_hidden: false },
    ];
    expect(topBrand(posts, brands)).toBe("Hims"); // 105 per post vs Hers (100 + 20) / 2 = 60
    expect(topBrand([], brands)).toBeNull();
  });

  it("greets like the voice guide, by first name when known", () => {
    expect(
      greeting({
        firstName: "Fatima",
        pullStartedAt: "2026-11-17T12:00:00Z",
        posts: 169,
        brands: 6,
      }),
    ).toBe(
      "Hey Fatima! 👋 I’ve read the 17 Nov pull, 169 posts from 6 brands. What should we dig into?",
    );
    expect(
      greeting({ firstName: null, pullStartedAt: "2026-11-17T12:00:00Z", posts: 1, brands: 1 }),
    ).toMatch(/^Hey! 👋 .*1 post from 1 brand\./);
  });

  it("source line: views when there are any, else likes", () => {
    expect(sourceLabel(source())).toBe("Hims · TikTok · 9 Nov · 212K views");
    expect(sourceLabel(source({ platform: "instagram", views: null, likes: 3400 }))).toBe(
      "Hims · Instagram · 9 Nov · 3.4K likes",
    );
    expect(sourceLabel(source({ views: null, likes: null, postedAt: null }))).toBe("Hims · TikTok");
  });

  it("history = the last 2 answered turns, as short text", () => {
    const messages: Message[] = [
      { id: 1, question: "q1", status: "done", answer: answer("one") },
      { id: 2, question: "q2", status: "error", kind: "failed" },
      { id: 3, question: "q3", status: "done", answer: answer("three") },
      { id: 4, question: "q4", status: "done", answer: answer("four") },
      { id: 5, question: "q5", status: "pending" },
    ];
    expect(historyFrom(messages)).toEqual([
      { q: "q3", a: "three\n1. a\n2. b\nFor OBU: try it" },
      { q: "q4", a: "four\n1. a\n2. b\nFor OBU: try it" },
    ]);
  });

  it("history leaves out small talk answered in code, keeps chat replies from Groq", () => {
    const chat: BlipAnswer = { type: "chat", message: "Let’s gooo! 🚀 Want the top post?" };
    const messages: Message[] = [
      { id: 1, question: "q1", status: "done", answer: answer("one") },
      { id: 2, question: "lets gooo", status: "done", answer: chat },
      { id: 3, question: "thanks!", status: "done", answer: chat, local: "thanks" },
    ];
    expect(historyFrom(messages)).toEqual([
      { q: "q1", a: "one\n1. a\n2. b\nFor OBU: try it" },
      { q: "lets gooo", a: "Let’s gooo! 🚀 Want the top post?" },
    ]);
  });

  it("copy text numbers the points; a chat reply copies as it is", () => {
    expect(answerText({ ...answer("L"), points: ["x"], forClient: "" })).toBe("L\n1. x");
    expect(answerText({ type: "chat", message: "Hey! 👋" })).toBe("Hey! 👋");
  });

  it("first name from the profile's full name", () => {
    expect(firstNameOf("Fatima Noor")).toBe("Fatima");
    expect(firstNameOf("  ")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe("Ask Blip small talk (answered in code, no Groq call)", () => {
  it("squashes repeated letters", () => {
    expect(squashRepeats("hiiiii")).toBe("hi");
    expect(squashRepeats("heyyyy")).toBe("hey");
    expect(squashRepeats("thanksss")).toBe("thanks");
    expect(squashRepeats("hello")).toBe("helo");
  });

  it.each([
    ["Hiiiii!!!", "hi"],
    ["HEYYYY 👋👋", "hey"],
    ["  hello.  ", "helo"],
    ["THANK   YOUUU 🙏🏽", "thank you"],
    ["thanks!! 👩‍💻", "thanks"],
    ["yo :)", "yo"],
    ["…ty…", "ty"],
    ["hi blip", "hi blip"],
  ])("normalises %j → %j", (text, out) => {
    expect(normaliseSmallTalk(text)).toBe(out);
  });

  it.each([
    ["hi", "greeting"],
    ["Hey!", "greeting"],
    ["HELLO", "greeting"],
    ["hellooooo", "greeting"],
    ["yo", "greeting"],
    ["yoooo!!", "greeting"],
    ["hiya", "greeting"],
    ["Hiyaaa 👋", "greeting"],
    ["👋 hi", "greeting"],
    ["hey?", "greeting"],
    ["thanks", "thanks"],
    ["thanksss!", "thanks"],
    ["Thank you", "thanks"],
    ["thank  youuu 🙏", "thanks"],
    ["ty", "thanks"],
    ["TYYY", "thanks"],
    ["thx", "thanks"],
    ["thx 🙌", "thanks"],
  ])("matches %j as %s", (text, kind) => {
    expect(matchSmallTalk(text)?.kind).toBe(kind);
  });

  it.each([
    "",
    "hi blip",
    "hey, what changed?",
    "hello there",
    "thanks, now give me 3 ideas",
    "thank you so much",
    "thankyou",
    "thnx",
    "hwy",
    "high",
    "this",
    "they",
    "hi 2",
    "lets gooo",
    "What’s working for Hims?",
    "hey thanks",
    "👋",
  ])("goes to Groq: %j", (text) => {
    expect(matchSmallTalk(text)).toBeNull();
  });

  it("counts stretch beyond the plain word (double letters in hello don't count)", () => {
    expect(matchSmallTalk("hiiii")?.stretch).toBe(3);
    expect(matchSmallTalk("hello")?.stretch).toBe(0);
    expect(matchSmallTalk("hellooo")?.stretch).toBe(2);
    expect(matchSmallTalk("thank youu")?.stretch).toBe(1);
  });

  it.each([
    ["hi", "calm"],
    ["hello", "calm"],
    ["thanks", "calm"],
    ["thank you.", "calm"],
    ["hi!", "warm"],
    ["hii", "warm"],
    ["hey 👋", "warm"],
    ["thanks! 🙏", "warm"],
    ["HI", "hype"],
    ["THANK YOU", "hype"],
    ["hiiii", "hype"],
    ["hey!!", "hype"],
    ["thanks 🙌🎉", "hype"],
    ["hii! 👋", "hype"],
  ])("energy of %j is %s", (text, energy) => {
    expect(matchSmallTalk(text)?.energy).toBe(energy);
  });

  it("energy ignores a single capital (Hi) and needs real letters for CAPS", () => {
    expect(smallTalkEnergy("Hi", 0)).toBe("calm");
    expect(smallTalkEnergy("Thanks", 0)).toBe("calm");
    expect(smallTalkEnergy("TY", 0)).toBe("hype");
  });

  it("rotates lines and wraps around", () => {
    const m = matchSmallTalk("hey!")!;
    const n = SMALL_TALK_LINES.greeting.warm.length;
    const first = smallTalkReply(m, "Fatima", 0);
    expect(first).toBe(
      "Hey Fatima! 👋 Ready when you are. Want to see what changed since the last pull?",
    );
    expect(smallTalkReply(m, "Fatima", 1)).not.toBe(first);
    expect(smallTalkReply(m, "Fatima", n)).toBe(first);
  });

  it("hype mirrors the stretch (2–5 extra letters)", () => {
    expect(smallTalkReply(matchSmallTalk("hiiii")!, "Fatima", 0)).toMatch(/^Hiiii Fatima! /);
    expect(smallTalkReply(matchSmallTalk("HI")!, "Fatima", 0)).toMatch(/^Hiii Fatima! /);
    expect(smallTalkReply(matchSmallTalk("hiiiiiiiiiiii")!, "Fatima", 0)).toMatch(
      /^Hiiiiii Fatima! /,
    );
    expect(smallTalkReply(matchSmallTalk("yoooo!!")!, "Fatima", 1)).toMatch(/^Yoooo Fatima! /);
    expect(smallTalkReply(matchSmallTalk("HELLO")!, "Fatima", 2)).toMatch(/^Hellooo Fatima! /);
    expect(smallTalkReply(matchSmallTalk("THANKS")!, "Fatima", 0)).toMatch(/^Yesss, Fatima! /);
  });

  it("every line: 3–4 per energy, first name, 1–2 emoji, fine without a name", () => {
    const emoji = /\p{Extended_Pictographic}/gu;
    for (const kind of ["greeting", "thanks"] as const) {
      for (const energy of ["calm", "warm", "hype"] as const) {
        const lines = SMALL_TALK_LINES[kind][energy];
        expect(lines.length).toBeGreaterThanOrEqual(3);
        expect(lines.length).toBeLessThanOrEqual(4);
        lines.forEach((_, i) => {
          const m = { kind, energy, stretch: 3, word: kind === "greeting" ? "hey" : "thanks" };
          const withName = smallTalkReply(m, "Fatima", i);
          expect(withName).toContain("Fatima");
          const count = withName.match(emoji)?.length ?? 0;
          expect(count).toBeGreaterThanOrEqual(1);
          expect(count).toBeLessThanOrEqual(2);
          expect(smallTalkReply(m, null, i)).not.toMatch(/null|undefined|\s[!.]|,\s*[!.]/);
        });
      }
    }
  });
});
