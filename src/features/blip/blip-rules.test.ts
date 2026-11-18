import { describe, expect, it } from "vitest";
import type { BlipAnswer, SourcePost } from "../../lib/ai/ai-api";
import { answerText } from "../../lib/ai/ai-api";
import {
  clientShort,
  greeting,
  historyFrom,
  type Message,
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
const answer = (lead: string): BlipAnswer => ({
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

  it("copy text numbers the points", () => {
    expect(answerText({ lead: "L", points: ["x"], forClient: "" })).toBe("L\n1. x");
  });
});
