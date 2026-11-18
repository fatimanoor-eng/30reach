import { describe, expect, it } from "vitest";
import {
  ASK_SCHEMA,
  bestFormat,
  capEmoji,
  CHAT_CHARS,
  bestSlot,
  buildSummary,
  clip,
  CLAIMS_SCHEMA,
  firstName,
  healthRedFlags,
  hookContext,
  HOOKS_SCHEMA,
  ideaFromAnswer,
  LIMITS,
  parseAskInput,
  parseClaimsInput,
  parseGroqJson,
  parseGroqMeter,
  parseHooksInput,
  parsePlanInput,
  pickTopPosts,
  PLAN_SCHEMA,
  type PullData,
  refToId,
  stripEmoji,
  type SummaryPost,
  textHash,
  validateAskAnswer,
  validateClaims,
  validateHooks,
  validatePlan,
} from "./ai-logic.ts";
import {
  ASK_CHAT_RULES,
  askSystem,
  BLIP_VOICE_CHAT,
  BLIP_VOICE_JSON,
  claimsSystem,
  hooksSystem,
  planSystem,
} from "./ai-prompts.ts";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const CARD = "22222222-2222-4222-8222-222222222222";
const HIMS = "aaaaaaaa-0000-4000-8000-000000000001";
const RO = "aaaaaaaa-0000-4000-8000-000000000002";

let n = 0;
function post(o: Partial<SummaryPost> = {}): SummaryPost {
  n++;
  return {
    id: `post-${n}`,
    competitor_id: HIMS,
    platform: "tiktok",
    external_id: `ext-${n}`,
    url: `https://example.com/${n}`,
    // Tue 10 Nov 2026, 7 pm Eastern = 00:00 UTC Wed
    posted_at: "2026-11-11T00:00:00Z",
    format: "video",
    caption: "A doctor answers your questions",
    hashtags: ["glp1"],
    likes: 100,
    comments: 10,
    views: 1000,
    counts_hidden: false,
    ...o,
  };
}

const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

function pullData(posts: SummaryPost[], previous: SummaryPost[] | null = null): PullData {
  return {
    clientName: "OBU Health",
    brands: [
      { id: HIMS, name: "Hims" },
      { id: RO, name: "Ro" },
    ],
    pull: { id: "pull-2", started_at: "2026-11-17T15:00:00Z" },
    posts,
    followers: [{ competitor_id: HIMS, platform: "tiktok", followers: 212000 }],
    previous: previous
      ? { id: "pull-1", started_at: "2026-11-06T15:00:00Z", posts: previous }
      : null,
  };
}

describe("text helpers", () => {
  it("clips at a word boundary with an ellipsis", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("Clinician answers: is Dry January worth it for you", 30)).toBe(
      "Clinician answers: is Dry…",
    );
  });

  it("strips emoji, joiners and flags", () => {
    expect(stripEmoji("New year 🚀 no crash diets ✨")).toBe("New year no crash diets");
    expect(stripEmoji("Team 👩‍⚕️ answers 🇺🇸")).toBe("Team answers");
  });

  it("finds a first name from the profile or the email", () => {
    expect(firstName("Fatima Noor")).toBe("Fatima");
    expect(firstName(null, "sam.lee@breakthirty.com")).toBe("Sam");
    expect(firstName("  ", null)).toBeNull();
  });

  it("hashes text stably", () => {
    expect(textHash("Hook: hi")).toBe(textHash("Hook: hi"));
    expect(textHash("Hook: hi")).not.toBe(textHash("Hook: hi!"));
    expect(textHash("x")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("best format / best slot", () => {
  it("needs 3 posts for a format and 2 for a slot", () => {
    const posts = [post({ format: "video", likes: 50 }), post({ format: "carousel", likes: 999 })];
    expect(bestFormat(posts)).toBeNull();
    expect(bestSlot(posts)).toBe("Tue evening");
    expect(bestSlot([post()])).toBeNull();
  });

  it("ignores posts with hidden counts", () => {
    const posts = [1, 2, 3].map(() => post({ format: "reel", platform: "instagram", likes: 10 }));
    posts.push(
      ...[1, 2, 3].map(() =>
        post({ format: "image", platform: "instagram", likes: 9999, counts_hidden: true }),
      ),
    );
    expect(bestFormat(posts)).toBe("reel");
  });
});

describe("buildSummary: compact, never raw", () => {
  it("summarises per brand × platform with followers, formats and new posts", () => {
    const prev = [post({ external_id: "old-1" })];
    const now = [
      post({ external_id: "old-1" }),
      post(),
      post({ competitor_id: RO, platform: "instagram", format: "reel", views: null }),
    ];
    const { summary } = buildSummary(pullData(now, prev));
    expect(summary.client).toBe("OBU Health");
    expect(summary.pull_date).toBe("17 Nov 2026");
    expect(summary.total_posts).toBe(3);
    const hims = summary.brands.find((b) => b.brand === "Hims")!;
    expect(hims).toMatchObject({
      platform: "tiktok",
      posts: 2,
      small_sample: true,
      followers: 212000,
      avg_likes: 100,
      new_since_previous: 1,
    });
    expect(summary.brands.find((b) => b.brand === "Ro")!.avg_views).toBeNull();
    expect(summary.previous?.pull_date).toBe("6 Nov 2026");
    expect(summary.not_in_data).toContain("posts from last year");
  });

  it("refers to posts as p1…pN and never includes ids, urls or raw fields", () => {
    const posts = [post({ likes: 5 }), post({ likes: 500 })];
    const { summary, refs, json } = buildSummary(pullData(posts));
    expect(summary.top_posts.map((p) => p.ref)).toEqual(["p1", "p2"]);
    expect(refs).toEqual([posts[1].id, posts[0].id]); // engagement order
    expect(json).not.toContain("post-");
    expect(json).not.toContain("https://");
    expect(json).not.toContain(HIMS);
  });

  it("stays under the size limit with a large pull", () => {
    const long = "word ".repeat(200);
    const posts = Array.from({ length: 200 }, (_, i) =>
      post({ competitor_id: i % 2 ? HIMS : RO, likes: i, caption: long, hashtags: [`t${i % 15}`] }),
    );
    const { json, summary } = buildSummary(pullData(posts, posts.slice(0, 50)));
    expect(json.length).toBeLessThanOrEqual(LIMITS.summaryChars);
    expect(summary.top_posts.length).toBeGreaterThanOrEqual(10);
    expect(summary.top_hashtags).toHaveLength(LIMITS.hashtags);
  });

  it("top posts include each brand's best before filling by engagement", () => {
    const big = Array.from({ length: 30 }, (_, i) => post({ likes: 1000 + i }));
    const small = post({ competitor_id: RO, platform: "instagram", format: "image", likes: 1 });
    const top = pickTopPosts([...big, small], 25);
    expect(top).toHaveLength(25);
    expect(top).toContain(small);
  });

  it("strips emoji from captions sent to the model", () => {
    const { summary } = buildSummary(pullData([post({ caption: "Big news 🚀🚀" })]));
    expect(summary.top_posts[0].caption).toBe("Big news");
  });
});

describe("refToId", () => {
  const refs = ["a", "b", "c"];
  it("accepts p2, post:p2 and [post:p2]", () => {
    expect(refToId("p2", refs)).toBe("b");
    expect(refToId("post:p2", refs)).toBe("b");
    expect(refToId("[post:p3]", refs)).toBe("c");
  });
  it("rejects unknown or invented refs", () => {
    expect(refToId("p9", refs)).toBeNull();
    expect(refToId("p0", refs)).toBeNull();
    expect(refToId("8f2c", refs)).toBeNull();
  });
});

describe("health red flags (code list)", () => {
  it("flags promises, cures, hype and food guilt with the exact text", () => {
    expect(healthRedFlags("Lose 10 lbs in 2 weeks, guaranteed!").map((f) => f.quote)).toEqual([
      "guaranteed",
      "Lose 10 lbs",
    ]);
    expect(healthRedFlags("This cures cravings")[0].quote).toBe("cures");
    expect(healthRedFlags("A guilt-free cheat meal")).toHaveLength(2);
    expect(healthRedFlags("Get your beach body")[0].why).toBe("Body shaming.");
    expect(healthRedFlags("A total game-changer")[0].why).toBe("Hype word.");
  });

  it("leaves supportive wording alone (09 example)", () => {
    expect(
      healthRedFlags(
        "You don't have to skip the party to stay on track. Eat before you go, start with protein, and skip the guilt. One meal doesn't undo your progress.",
      ),
    ).toEqual([]);
  });
});

describe("Groq responses", () => {
  it("reads the rate-limit headers (requests per day, tokens per minute)", () => {
    const meter = parseGroqMeter(
      headers({
        "x-ratelimit-remaining-requests": "987",
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-tokens": "7400",
        "x-ratelimit-limit-tokens": "8000",
        "x-ratelimit-reset-requests": "1m26s",
        "x-ratelimit-reset-tokens": "4.5s",
      }),
      "openai/gpt-oss-120b",
    );
    expect(meter).toEqual({
      model: "openai/gpt-oss-120b",
      remaining_requests: 987,
      limit_requests: 1000,
      remaining_tokens: 7400,
      limit_tokens: 8000,
      reset_requests: "1m26s",
      reset_tokens: "4.5s",
    });
    expect(parseGroqMeter(headers({}), "m")).toBeNull();
  });

  it("parses JSON content and rejects cut-off or broken answers", () => {
    const body = (content: unknown, finish = "stop") => ({
      choices: [{ finish_reason: finish, message: { content } }],
    });
    expect(parseGroqJson(body('{"hooks":["a"]}'))).toEqual({ hooks: ["a"] });
    expect(parseGroqJson(body('{"hooks":["a"', "length"))).toBeNull();
    expect(parseGroqJson(body("not json"))).toBeNull();
    expect(parseGroqJson(body(""))).toBeNull();
    expect(parseGroqJson({})).toBeNull();
  });

  it("schemas follow strict mode (all keys required, no extra keys)", () => {
    const check = (s: Record<string, unknown>): void => {
      if (s.type === "object") {
        const props = s.properties as Record<string, Record<string, unknown>>;
        expect(s.additionalProperties).toBe(false);
        expect(s.required).toEqual(Object.keys(props));
        Object.values(props).forEach(check);
      }
      if (s.type === "array") check(s.items as Record<string, unknown>);
    };
    [ASK_SCHEMA, PLAN_SCHEMA, CLAIMS_SCHEMA, HOOKS_SCHEMA].forEach((s) => check(s.schema));
  });
});

describe("inputs from the browser", () => {
  it("ask: needs a client and a question ≤ 500 chars; keeps the last 2 turns", () => {
    expect(parseAskInput({ clientId: "x", question: "hi" })).toEqual({ error: "bad_client" });
    expect(parseAskInput({ clientId: CLIENT, question: "   " })).toEqual({
      error: "empty_question",
    });
    expect(parseAskInput({ clientId: CLIENT, question: "a".repeat(501) })).toEqual({
      error: "question_too_long",
    });
    const ok = parseAskInput({
      clientId: CLIENT,
      question: " What  changed? ",
      history: [{ q: "1", a: "1" }, { q: "2", a: "2" }, { q: "3", a: "x".repeat(900) }, "junk"],
    });
    expect(ok).toMatchObject({ question: "What changed?" });
    if ("error" in ok) throw new Error();
    expect(ok.history.map((t) => t.q)).toEqual(["2", "3"]);
    expect(ok.history[1].a.length).toBeLessThanOrEqual(LIMITS.historyChars);
  });

  it("plan: this month up to 3 ahead; only events inside the month", () => {
    const today = "2026-11-18";
    expect(parsePlanInput({ clientId: CLIENT, month: "2026-10" }, today)).toEqual({
      error: "bad_month",
    });
    expect(parsePlanInput({ clientId: CLIENT, month: "2027-03" }, today)).toEqual({
      error: "bad_month",
    });
    expect(parsePlanInput({ clientId: CLIENT, month: "2027-1" }, today)).toEqual({
      error: "bad_month",
    });
    const ok = parsePlanInput(
      {
        clientId: CLIENT,
        month: "2027-01",
        events: [
          { date: "2027-01-01", name: "New Year's Day", kind: "holiday" },
          { date: "2027-02-01", name: "Wrong month", kind: "holiday" },
          { date: "2027-01-18", name: "MLK Day", kind: "ai" },
        ],
      },
      today,
    );
    expect(ok).toEqual({
      clientId: CLIENT,
      month: "2027-01",
      events: [{ date: "2027-01-01", name: "New Year's Day", kind: "holiday" }],
    });
  });

  it("claims: labels the parts and refuses an empty draft", () => {
    expect(parseClaimsInput({ cardId: CARD })).toEqual({ error: "nothing_to_check" });
    expect(
      parseClaimsInput({ cardId: CARD, title: "Holiday eating", hook: "No guilt", caption: "" }),
    ).toEqual({
      cardId: CARD,
      draft: "Title: Holiday eating\nHook: No guilt",
    });
  });

  it("hooks: needs a title or caption; drops formats the platform doesn't have", () => {
    expect(parseHooksInput({ clientId: CLIENT })).toEqual({ error: "nothing_to_use" });
    expect(
      parseHooksInput({ clientId: CLIENT, title: "Q&A", platform: "tiktok", format: "reel" }),
    ).toMatchObject({
      platform: "tiktok",
      format: null,
    });
    expect(
      parseHooksInput({ clientId: CLIENT, title: "Q&A", platform: "x", format: "reel" }),
    ).toMatchObject({
      platform: null,
      format: null,
    });
  });
});

describe("validateAskAnswer", () => {
  const refs = ["id-1", "id-2", "id-3"];
  const good = {
    type: "insight",
    message: "",
    lead: "Hims is winning with short doctor Q&A videos 🎯",
    points: [
      "9 of their top 10 posts are Q&A [post:p1]",
      "About 3× the likes of carousels [p2, p3]",
    ],
    for_client: "For OBU Health: a 'Clinician answers' series, under 30 seconds.",
    post_refs: ["p1", "p9"],
    in_data: true,
  };

  const insight = (raw: unknown) => {
    const a = validateAskAnswer(raw, refs);
    if (a?.type !== "insight") throw new Error(`expected an insight, got ${JSON.stringify(a)}`);
    return a;
  };

  it("maps refs (listed and inline) to post ids, drops unknown ones, removes inline markers", () => {
    const a = insight(good);
    expect(a.postIds).toEqual(["id-1", "id-2", "id-3"]);
    expect(a.points[0]).toBe("9 of their top 10 posts are Q&A");
    expect(a.lead).toContain("🎯"); // emojis are fine in chat
  });

  it("rejects the wrong shape", () => {
    expect(validateAskAnswer({ ...good, in_data: "yes" }, refs)).toBeNull();
    expect(validateAskAnswer({ ...good, lead: "" }, refs)).toBeNull();
    expect(validateAskAnswer(null, refs)).toBeNull();
    expect(validateAskAnswer({ ...good, type: undefined }, refs)).toBeNull();
    expect(validateAskAnswer({ ...good, type: "joke" }, refs)).toBeNull();
  });

  it("caps points at 5", () => {
    expect(insight({ ...good, points: Array(9).fill("x") }).points).toHaveLength(5);
  });

  // Chat mode (AI_PROMPTS.md §1). Mocked model replies for each case; the real choice of type is
  // only checked against Groq after deploying (STATUS.md › What's next).
  const chat = (message: string) => ({
    type: "chat",
    message,
    lead: "",
    points: [],
    for_client: "",
    post_refs: [],
    in_data: false,
  });

  it.each([
    ["greeting", "Hey Fatima! 👋 Want to see what changed since the last pull?"],
    ["hype", "LETS GOOO 🚀🔥 Hims just had its best week, want the top post?"],
    ["thanks", "Anytime! 🙌 Want 3 post ideas from this pull next?"],
    [
      "feelings",
      "Love is a bit above my pay grade 😄 but I do love a good carousel. Peek at Hims?",
    ],
    ["stressed", "That sounds like a lot. Let’s keep it simple: want the one post worth copying?"],
    [
      "off-topic",
      "I’ll leave the weather to the experts ☀️ Want to see Tuesday’s best slot instead?",
    ],
    [
      "medical",
      "I can’t give medical advice, a clinician is the right person for that. Want to see how brands talk about it?",
    ],
  ])("chat (%s): message only, no sources or idea", (_case, message) => {
    expect(validateAskAnswer(chat(message), refs)).toEqual({ type: "chat", message });
  });

  it("chat: ignores insight fields the model filled anyway", () => {
    const a = validateAskAnswer({ ...chat("Hi! 👋"), lead: "x", post_refs: ["p1"] }, refs);
    expect(a).toEqual({ type: "chat", message: "Hi! 👋" });
  });

  it("chat: keeps 2 emoji at most, strips p-refs, clips long replies", () => {
    expect(validateAskAnswer(chat("So hyped 🚀🔥🎉🙌 lets go"), refs)).toEqual({
      type: "chat",
      message: "So hyped 🚀🔥 lets go",
    });
    expect(validateAskAnswer(chat("Nice one [p2] 🎯"), refs)).toEqual({
      type: "chat",
      message: "Nice one 🎯",
    });
    const long = validateAskAnswer(chat("word ".repeat(100)), refs);
    expect(long?.type === "chat" && long.message.length).toBeLessThanOrEqual(CHAT_CHARS);
  });

  it("chat: an empty or missing message is retried (null)", () => {
    expect(validateAskAnswer(chat("   "), refs)).toBeNull();
    expect(validateAskAnswer(chat("[p1]"), refs)).toBeNull();
    expect(validateAskAnswer({ ...chat("x"), message: 3 }, refs)).toBeNull();
  });

  it("capEmoji counts a ZWJ sequence, skin tone or flag as one", () => {
    expect(capEmoji("a 👩‍💻 b 👋🏽 c 🇺🇸 d", 2)).toBe("a 👩‍💻 b 👋🏽 c d");
    expect(capEmoji("no emoji", 2)).toBe("no emoji");
  });

  it("turns 'For {client}:' into plain idea text", () => {
    expect(
      ideaFromAnswer("For OBU Health: a weekly clinician Q&A on TikTok 🎯", "OBU Health"),
    ).toBe("A weekly clinician Q&A on TikTok");
    expect(ideaFromAnswer("For OBU: try carousels", "OBU Health")).toBe("Try carousels");
  });
});

describe("validatePlan", () => {
  const ctx = { month: "2027-01", today: "2026-11-18", refs: ["id-1"] };
  const idea = (o: Record<string, unknown> = {}) => ({
    date: "2027-01-05",
    platform: "tiktok",
    format: "video",
    title: "Clinician answers: is Dry January worth it?",
    reason: "Q&A videos are Hims' best TikTok format this month.",
    source_refs: ["p1"],
    ...o,
  });

  it("keeps valid ideas, sorted by date, with sources mapped", () => {
    const out = validatePlan(
      {
        ideas: [
          idea({ date: "2027-01-19", title: "B" }),
          idea({ date: "2027-01-01", title: "A" }),
          idea({ title: "C" }),
        ],
      },
      ctx,
    )!;
    expect(out.map((i) => i.title)).toEqual(["A", "C", "B"]);
    expect(out[0].sourcePostIds).toEqual(["id-1"]);
  });

  it("drops wrong dates, bad platform/format pairs, duplicates and red flags", () => {
    const out = validatePlan(
      {
        ideas: [
          idea({ title: "ok 1" }),
          idea({ date: "2027-02-01", title: "next month" }),
          idea({ date: "2027-01-32", title: "no such day" }),
          idea({ format: "reel", title: "reel on tiktok" }),
          idea({ title: "OK 1" }),
          idea({ title: "Lose 10 lbs by February" }),
          idea({ title: "ok 2" }),
          idea({ title: "ok 3 🚀" }),
        ],
      },
      ctx,
    )!;
    expect(out.map((i) => i.title)).toEqual(["ok 1", "ok 2", "ok 3"]);
  });

  it("never plans in the past", () => {
    expect(
      validatePlan(
        {
          ideas: [
            idea({ date: "2026-11-02", title: "a" }),
            idea({ title: "b" }),
            idea({ title: "c" }),
          ],
        },
        { ...ctx, month: "2026-11" },
      ),
    ).toBeNull();
  });

  it("cuts long titles and reasons; needs `min` ideas; max 6", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      idea({ title: `Idea ${i} ${"long ".repeat(20)}`, reason: "r ".repeat(100) }),
    );
    const out = validatePlan({ ideas: many }, ctx)!;
    expect(out).toHaveLength(LIMITS.planIdeas);
    expect(
      out.every(
        (i) => i.title.length <= LIMITS.titleChars && i.reason.length <= LIMITS.reasonChars,
      ),
    ).toBe(true);
    expect(validatePlan({ ideas: [idea()] }, ctx)).toBeNull();
    expect(validatePlan({ ideas: [idea()] }, { ...ctx, min: 1 })).toHaveLength(1);
  });
});

describe("validateClaims", () => {
  const draft =
    "Title: Reset week\nHook: Lose 10 lbs before the holidays\nCaption: Our plan melts fat. Try it today.";

  it("keeps only quotes really in the draft and derives the status", () => {
    const out = validateClaims(
      {
        status: "flagged",
        issues: [
          { quote: "lose 10 lbs before the holidays", why: "Weight-loss promise" },
          { quote: "invented phrase", why: "x" },
        ],
      },
      draft,
    )!;
    expect(out.status).toBe("flagged");
    expect(out.issues.map((i) => i.quote)).toEqual([
      "lose 10 lbs before the holidays",
      "melts fat",
    ]);
  });

  it("adds code red flags even when the model says clear", () => {
    expect(
      validateClaims({ status: "clear", issues: [] }, draft)!.issues.map((i) => i.quote),
    ).toEqual(["Lose 10 lbs", "melts fat"]);
  });

  it("clear stays clear for supportive wording", () => {
    expect(
      validateClaims({ status: "clear", issues: [] }, "Hook: You don't have to skip the party."),
    ).toEqual({
      status: "clear",
      issues: [],
    });
  });

  it("matches curly quotes and dashes", () => {
    const out = validateClaims(
      {
        status: "flagged",
        issues: [{ quote: "don't have to diet – ever", why: "Absolute claim" }],
      },
      "Hook: You don’t have to diet — ever.",
    )!;
    expect(out.issues).toHaveLength(1);
  });

  it("asks again when the model flags things that aren't in the draft", () => {
    expect(
      validateClaims({ status: "flagged", issues: [{ quote: "nope", why: "x" }] }, "Hook: hi"),
    ).toBeNull();
    expect(validateClaims({ status: "maybe", issues: [] }, "Hook: hi")).toBeNull();
  });
});

describe("validateHooks", () => {
  it("returns 3 clean hooks", () => {
    expect(
      validateHooks({
        hooks: [
          "“You don't have to skip the party.” 🎉",
          "What a clinician eats before a party",
          "Three small swaps, zero guilt",
        ],
      }),
    ).toEqual([
      "You don't have to skip the party.",
      "What a clinician eats before a party",
      "Three small swaps, zero guilt",
    ]);
  });

  it("drops red flags, duplicates and long hooks; accepts 2 on the retry", () => {
    const raw = {
      hooks: ["Guaranteed results", "Same hook", "same hook", "x".repeat(101), "Another"],
    };
    expect(validateHooks(raw)).toBeNull();
    expect(validateHooks(raw, 2)).toEqual(["Same hook", "Another"]);
  });
});

describe("hookContext", () => {
  it("gives the top openings for the platform, first line only", () => {
    const posts = [
      post({ caption: "A doctor answers 🚀\nmore text", likes: 900 }),
      post({ platform: "instagram", format: "reel", caption: "IG only" }),
    ];
    const ctx = hookContext(pullData(posts), "tiktok");
    expect(ctx.platform).toBe("TikTok");
    expect(ctx.top_openings).toEqual([
      { brand: "Hims", format: "video", first_line: "A doctor answers", likes: 900, views: 1000 },
    ]);
  });
});

describe("prompts", () => {
  it("every prompt carries Blip's voice; JSON prompts forbid emojis", () => {
    expect(askSystem({ client: "OBU Health", firstName: "Fatima" })).toContain(BLIP_VOICE_CHAT);
    expect(askSystem({ client: "OBU Health", firstName: "Fatima" })).toContain(
      "first name is Fatima",
    );
    expect(askSystem({ client: "OBU Health", firstName: null })).not.toContain("first name is");
    for (const p of [
      planSystem({ client: "OBU Health", monthName: "January", year: 2027 }),
      claimsSystem(),
      hooksSystem({ client: "OBU Health", platform: "tiktok" }),
    ]) {
      expect(p).toContain(BLIP_VOICE_JSON);
      expect(p).toMatch(/no emojis/i);
    }
  });

  it("ask prompt has chat mode: when, tone, honesty, stressed, unsafe, and empty insight fields", () => {
    const p = askSystem({ client: "OBU Health", firstName: "Fatima" });
    expect(p).toContain(ASK_CHAT_RULES);
    expect(p).toMatch(/type "chat"/);
    expect(p).toMatch(/type "insight"/);
    expect(ASK_CHAT_RULES).toMatch(/greetings, hype, thanks, feelings/);
    expect(ASK_CHAT_RULES).toMatch(/1-2 short sentences/);
    expect(ASK_CHAT_RULES).toMatch(/lets gooo/);
    expect(ASK_CHAT_RULES).toMatch(/nudge back to the data/);
    expect(ASK_CHAT_RULES).toMatch(/never claim real feelings or to be human/);
    expect(ASK_CHAT_RULES).toMatch(/pay grade/);
    expect(ASK_CHAT_RULES).toMatch(/Stressed or upset: calm and caring, no jokes, no emojis/);
    expect(ASK_CHAT_RULES).toMatch(/Never give medical/);
  });

  it("plan prompt says there's no data from last year", () => {
    expect(planSystem({ client: "OBU Health", monthName: "January", year: 2027 })).toMatch(
      /no data from last year/,
    );
  });

  it("system prompts stay small (tokens)", () => {
    const sizes = [
      askSystem({ client: "OBU Health", firstName: "Fatima" }),
      planSystem({ client: "OBU Health", monthName: "January", year: 2027 }),
      claimsSystem(),
      hooksSystem({ client: "OBU Health", platform: null }),
    ].map((s) => s.length);
    expect(Math.max(...sizes)).toBeLessThan(2800); // ≈ 700 tokens
  });
});
