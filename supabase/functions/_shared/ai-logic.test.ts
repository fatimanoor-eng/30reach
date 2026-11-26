import { describe, expect, it } from "vitest";
import {
  cleanFollowUps,
  trimHistory,
  followersChange,
  ASK_LIGHT_SCHEMA,
  ASK_SCHEMA,
  bestFormat,
  CAPTION_STYLE,
  CAPTIONS_SCHEMA,
  captionContext,
  humanizeRefs,
  parseCaptionInput,
  refLabel,
  todayContext,
  validateCaptions,
  capEmoji,
  CHAT_CHARS,
  bestSlot,
  buildSummary,
  clip,
  CLAIMS_SCHEMA,
  firstName,
  groqErrorCode,
  groqErrorLog,
  groqRequestBody,
  retryModeAfter,
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
  tokenLog,
  validateAskAnswer,
  validateLightAnswer,
  validateClaims,
  validateHooks,
  validatePlan,
} from "./ai-logic.ts";
import {
  ALL_KEYS,
  ASK_CHAT_EXAMPLE,
  ASK_INSIGHT_EXAMPLE,
  ASK_CHAT_RULES,
  askLightSystem,
  FACTS,
  askLightUser,
  askSystem,
  askUser,
  captionsSystem,
  captionsUser,
  NO_YEARS,
  todayLine,
  BLIP_VOICE_CHAT,
  BLIP_VOICE_JSON,
  claimsSystem,
  hooksSystem,
  planSystem,
} from "./ai-prompts.ts";
import { contextFromRow } from "./client-context.ts";

/** OBU as the 17a migration left it (health topics → health check on, 3 content rules). */
const OBU_CTX = contextFromRow({
  name: "OBU Health",
  description:
    "Prescription weight loss, GLP-1, NAD+ and peptide treatments online, with US board-certified doctors.",
  industry: "Telehealth · weight loss and wellness",
  audience: "Adults looking for prescription weight-loss or longevity treatment",
  country: "US",
  language: "en",
  regulated: ["health", "medical claims", "weight loss", "pharma"],
  audience_is_kids: false,
  content_rules: [
    { rule: "No before / after photos or guaranteed weight loss" },
    { rule: "Don't imply treatment without a doctor's review" },
    { rule: "Adults only: don't aim posts at under-18s" },
  ],
});

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
    shares: null,
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
    // 26 Nov: engagement rate = avg engagement ÷ followers × 100; null without a follower count.
    expect(hims.engagement_rate_pct).toBeCloseTo(
      Math.round(((hims.avg_likes + hims.avg_comments) / 212000) * 100 * 100) / 100,
    );
    expect(summary.brands.find((b) => b.brand === "Ro")!.engagement_rate_pct).toBeNull();
    expect(summary.engagement_means).toMatch(/engagement_rate_pct/);
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
    [
      ASK_SCHEMA,
      ASK_LIGHT_SCHEMA,
      PLAN_SCHEMA,
      CLAIMS_SCHEMA,
      HOOKS_SCHEMA,
      CAPTIONS_SCHEMA,
    ].forEach((s) => check(s.schema));
  });

  it("schemas use only keywords Groq's strict mode documents (no minItems, maxLength, format…)", () => {
    const allowed = new Set([
      "type",
      "properties",
      "required",
      "additionalProperties",
      "items",
      "enum",
    ]);
    const walk = (s: Record<string, unknown>, path: string): void => {
      for (const key of Object.keys(s)) expect(allowed, `${path}.${key}`).toContain(key);
      expect(["object", "array", "string", "boolean", "number", "integer"]).toContain(s.type);
      if (s.enum) {
        expect(s.type).toBe("string");
        (s.enum as unknown[]).forEach((v) => expect(typeof v).toBe("string"));
      }
      if (s.type === "object")
        for (const [k, v] of Object.entries(
          s.properties as Record<string, Record<string, unknown>>,
        ))
          walk(v, `${path}.${k}`);
      if (s.type === "array") walk(s.items as Record<string, unknown>, `${path}[]`);
    };
    for (const s of [
      ASK_SCHEMA,
      ASK_LIGHT_SCHEMA,
      PLAN_SCHEMA,
      CLAIMS_SCHEMA,
      HOOKS_SCHEMA,
      CAPTIONS_SCHEMA,
    ]) {
      expect(s.name).toMatch(/^[a-z_]{1,64}$/);
      walk(s.schema, s.name);
    }
  });
});

describe("inputs from the browser", () => {
  it("ask: needs a client and a question ≤ 500 chars; keeps the turns that fit (round 1)", () => {
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
    expect(ok.history.map((t) => t.q)).toEqual(["1", "2", "3"]);
    expect(ok.history[2].a.length).toBeLessThanOrEqual(LIMITS.historyChars);
    expect(ok.light).toBe(false);
  });

  it("memory: up to 6 turns; older answers shrink to their first line; fits the budget", () => {
    const turn = (n: number) => ({
      q: `question ${n} ${"q".repeat(250)}`,
      a: `first line ${n}\n${"detail ".repeat(100)}`,
    });
    const kept = trimHistory(Array.from({ length: 9 }, (_, i) => turn(i + 1)));
    expect(kept.length).toBeLessThanOrEqual(6);
    expect(kept.at(-1)!.q).toMatch(/^question 9/); // newest always kept
    expect(kept.at(-1)!.a.length).toBeLessThanOrEqual(LIMITS.historyChars); // full (clipped) answer
    expect(kept[0].a).not.toContain("\n"); // older: first line only
    expect(kept[0].a.length).toBeLessThanOrEqual(160);
    const size = kept.reduce((n, t) => n + t.q.length + t.a.length, 0);
    expect(size).toBeLessThanOrEqual(LIMITS.historyBudget);
    // Short chats keep everything.
    expect(
      trimHistory([
        { q: "a", a: "b" },
        { q: "c", a: "d" },
      ]),
    ).toHaveLength(2);
  });

  it("followers_change: both pulls must have read it (not carried, not Facebook)", () => {
    const f = (
      platform: "instagram" | "facebook",
      followers: number,
      error_code: string | null = null,
    ) => ({
      competitor_id: HIMS,
      platform,
      followers,
      error_code,
    });
    expect(
      followersChange(
        { followers: [f("instagram", 1200)], previousFollowers: [f("instagram", 1000)] },
        HIMS,
        "instagram",
      ),
    ).toBe(200);
    expect(
      followersChange(
        { followers: [f("instagram", 1200, "carried")], previousFollowers: [f("instagram", 1000)] },
        HIMS,
        "instagram",
      ),
    ).toBeNull();
    expect(
      followersChange(
        { followers: [f("facebook", 9)], previousFollowers: [f("facebook", 8)] },
        HIMS,
        "facebook",
      ),
    ).toBeNull();
    expect(followersChange({ followers: [f("instagram", 1)] }, HIMS, "instagram")).toBeNull();
  });

  it("ask: light mode only when asked for and the question is ≤ 40 chars", () => {
    const light = (question: string, flag: unknown) =>
      (parseAskInput({ clientId: CLIENT, question, light: flag }) as { light: boolean }).light;
    expect(light("hehehe", true)).toBe(true);
    expect(light("a".repeat(40), true)).toBe(true);
    expect(light("a".repeat(41), true)).toBe(false); // too long: full mode, data included
    expect(light("hehehe", "true")).toBe(false);
    expect(light("hehehe", undefined)).toBe(false);
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
      parseHooksInput({ clientId: CLIENT, title: "Q&A", platform: "pinterest", format: "reel" }),
    ).toMatchObject({
      platform: null,
      format: null,
    });
    // YouTube (18): a reel isn't a YouTube format; a short is.
    expect(
      parseHooksInput({ clientId: CLIENT, title: "Q&A", platform: "youtube", format: "reel" }),
    ).toMatchObject({ platform: "youtube", format: null });
    expect(
      parseHooksInput({ clientId: CLIENT, title: "Q&A", platform: "youtube", format: "short" }),
    ).toMatchObject({ platform: "youtube", format: "short" });
  });
});

/** A copy of `o` without key `k` (a key the model left out, not one set to undefined). */
const without = (o: Record<string, unknown>, k: string) => {
  const copy = { ...o };
  delete copy[k];
  return copy;
};

const TODAY = "Thursday 19 November 2026";

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

  it("rejects answers without the content their type needs", () => {
    expect(validateAskAnswer({ ...good, lead: "" }, refs)).toBeNull(); // insight needs a lead
    expect(validateAskAnswer({ ...good, lead: "[p1]" }, refs)).toBeNull(); // …that isn't only a ref
    expect(validateAskAnswer(without(good, "points"), refs)).toBeNull(); // …and a points array
    expect(validateAskAnswer({ type: "insight" }, refs)).toBeNull();
    expect(validateAskAnswer({}, refs)).toBeNull();
    expect(validateAskAnswer(null, refs)).toBeNull();
    expect(validateAskAnswer("hi", refs)).toBeNull();
  });

  // The real-Groq failure: "json_validate_failed … missing properties: 'message'".
  it("insight without message (the real Groq answer): accepted, message isn't needed", () => {
    expect(insight(without(good, "message"))).toMatchObject({
      type: "insight",
      lead: insight(good).lead,
    });
  });

  it("insight: missing for_client / post_refs / in_data get safe defaults", () => {
    const a = insight({ type: "insight", lead: "Carousels lead [p2]", points: ["3× the likes"] });
    expect(a).toEqual({
      type: "insight",
      lead: "Carousels lead",
      points: ["3× the likes"],
      forClient: "",
      postIds: ["id-2"], // the inline ref still counts
      inData: true, // has points
      followUps: [], // none sent: the panel shows its usual starters
    });
    expect(insight({ lead: "Can't see that in this pull", points: [] }).inData).toBe(false);
    expect(insight({ ...good, in_data: "yes" }).inData).toBe(true); // wrong type → default
    expect(insight({ ...good, post_refs: "p1" }).postIds).toEqual(["id-1", "id-2", "id-3"]);
  });

  it("works out a missing or unknown type from the content", () => {
    expect(insight({ ...good, type: undefined }).type).toBe("insight");
    expect(insight({ ...good, type: "joke" }).type).toBe("insight");
    expect(validateAskAnswer({ message: "hehe 😄 good one" }, refs)).toEqual({
      type: "chat",
      message: "hehe 😄 good one",
    });
    // Says "chat" but only filled the insight fields: treated as the insight it is.
    expect(insight({ ...good, type: "chat", message: "" }).lead).toBe(insight(good).lead);
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

  it("chat without the insight keys (lead, points…): accepted", () => {
    expect(validateAskAnswer({ type: "chat", message: "Anytime! 🙌" }, refs)).toEqual({
      type: "chat",
      message: "Anytime! 🙌",
    });
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

  it("light mode: message only, cleaned like chat; empty → retry", () => {
    expect(
      validateLightAnswer({ message: "hehe 😄 that one got me. Want to dig into a brand?" }),
    ).toEqual({ type: "chat", message: "hehe 😄 that one got me. Want to dig into a brand?" });
    expect(validateLightAnswer({ message: "lol 😂😂😂 ok [p1]" })).toEqual({
      type: "chat",
      message: "lol 😂😂 ok",
    });
    expect(validateLightAnswer({ message: "  " })).toBeNull();
    expect(validateLightAnswer({ lead: "x" })).toBeNull();
    expect(validateLightAnswer(null)).toBeNull();
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
    expect(validateClaims({}, "Hook: hi")).toBeNull(); // neither status nor issues
    expect(validateClaims(null, "Hook: hi")).toBeNull();
  });
});

describe("validateClaims, lenient shape", () => {
  it("clear without issues, or issues without status: status comes from the issues", () => {
    expect(validateClaims({ status: "clear" }, "Hook: Small swaps that feel good")).toEqual({
      status: "clear",
      issues: [],
    });
    expect(
      validateClaims({ issues: [{ quote: "lose 10 lbs" }] }, "Hook: Lose 10 lbs in a week"),
    ).toMatchObject({ status: "flagged", issues: [{ quote: "lose 10 lbs" }] });
    // Code red flags still run when the model said clear and left out issues.
    expect(validateClaims({ status: "clear" }, "Hook: Lose 10 lbs fast").status).toBe("flagged");
    expect(validateClaims({ status: "maybe", issues: [] }, "Hook: hi")).toEqual({
      status: "clear",
      issues: [],
    });
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

describe("Groq request and errors", () => {
  const body = groqRequestBody({
    model: "openai/gpt-oss-120b",
    system: "SYSTEM PROMPT",
    user: "USER PROMPT",
    schema: ASK_SCHEMA,
    maxTokens: 3000,
  });

  it("sends only params Groq documents for gpt-oss + strict json_schema", () => {
    expect(Object.keys(body).sort()).toEqual(
      [
        "include_reasoning",
        "max_completion_tokens",
        "messages",
        "model",
        "reasoning_effort",
        "response_format",
        "temperature",
      ].sort(),
    );
    expect(["low", "medium", "high"]).toContain(body.reasoning_effort);
    expect(body.include_reasoning).toBe(false);
    expect(body).not.toHaveProperty("reasoning_format"); // not supported on gpt-oss
    expect(body).not.toHaveProperty("stream"); // not supported with Structured Outputs
    expect(body).not.toHaveProperty("tools");
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "blip_answer", schema: ASK_SCHEMA.schema, strict: true },
    });
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("logs Groq's error safely: code, type, param, message; never keys or model output", () => {
    const err = JSON.stringify({
      error: {
        message:
          "Failed to generate JSON. Please adjust your prompt. Key gsk_abc123XYZ was used. Authorization: Bearer gsk_zzz",
        type: "invalid_request_error",
        code: "json_validate_failed",
        param: "response_format",
        failed_generation: '{"type":"insight","lead":"Hims posts SECRET DATA',
      },
    });
    const line = groqErrorLog("ask-blip full", 400, err);
    expect(line).toMatch(
      /^ask-blip full · Groq HTTP 400 · json_validate_failed \(invalid_request_error\) · param response_format: Failed to generate JSON/,
    );
    expect(line).toContain("failed_generation 48 chars");
    expect(line).not.toMatch(/gsk_[A-Za-z0-9]/);
    expect(line).not.toContain("SECRET DATA");
  });

  it("copes with a non-JSON or empty error body", () => {
    expect(groqErrorLog("plan-month", 502, "<html>Bad gateway</html>")).toBe(
      "plan-month · Groq HTTP 502 · 24 chars, not a Groq error object",
    );
    expect(groqErrorLog("plan-month", 400, "")).toBe(
      "plan-month · Groq HTTP 400 · 0 chars, not a Groq error object",
    );
  });

  it("clips a long message to 300 characters", () => {
    const long = JSON.stringify({ error: { message: "x ".repeat(400) } });
    expect(groqErrorLog("f", 400, long).length).toBeLessThan(340);
  });
});

describe("json_validate_failed fallback", () => {
  const vf = JSON.stringify({
    error: {
      message: "Generated JSON does not match the expected schema: missing properties: 'message'",
      type: "invalid_request_error",
      code: "json_validate_failed",
    },
  });
  const other = JSON.stringify({ error: { message: "bad param", code: "invalid_request" } });

  it("reads Groq's error code", () => {
    expect(groqErrorCode(vf)).toBe("json_validate_failed");
    expect(groqErrorCode("nope")).toBeNull();
    expect(groqErrorCode("{}")).toBeNull();
  });

  it("only a strict json_validate_failed on the first try gets ONE json_object retry", () => {
    expect(retryModeAfter(400, vf, 1, "strict")).toBe("json_object");
    expect(retryModeAfter(400, vf, 2, "strict")).toBeNull();
    expect(retryModeAfter(400, vf, 1, "json_object")).toBeNull();
    expect(retryModeAfter(400, other, 1, "strict")).toBeNull(); // other 400s fail the same way
    expect(retryModeAfter(500, vf, 1, "strict")).toBeNull();
    expect(retryModeAfter(413, "", 1, "strict")).toBeNull();
  });

  it("json_object mode: same params, no schema", () => {
    const body = groqRequestBody({
      model: "m",
      system: "Reply with JSON",
      user: "u",
      schema: ASK_SCHEMA,
      maxTokens: 3000,
      mode: "json_object",
    });
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.reasoning_effort).toBe("low");
    expect(body.max_completion_tokens).toBe(3000);
  });

  it("the mocked fallback answer (insight, no message) passes our validator", () => {
    const answer = { type: "insight", lead: "Carousels lead", points: ["3× the likes [p1]"] };
    expect(validateAskAnswer(answer, ["id-1"])).toMatchObject({
      type: "insight",
      postIds: ["id-1"],
      forClient: "",
    });
  });
});

describe("tokenLog", () => {
  const headers = (h: Record<string, string>) => new Headers(h);
  it("logs tokens in / out / reasoning / total and what's left this minute, never content", () => {
    const body = {
      usage: {
        prompt_tokens: 412,
        completion_tokens: 96,
        total_tokens: 508,
        completion_tokens_details: { reasoning_tokens: 40 },
      },
      choices: [{ message: { content: "SECRET ANSWER" } }],
    };
    const line = tokenLog(
      "ask-blip light",
      body,
      headers({ "x-ratelimit-remaining-tokens": "7400" }),
    );
    expect(line).toBe(
      "ask-blip light · tokens 412 in + 96 out (reasoning 40) = 508 · 7400 tokens/min left",
    );
    expect(line).not.toContain("SECRET");
  });
  it("copes with a missing usage block or headers", () => {
    expect(tokenLog("plan-month", null, headers({}))).toBe("plan-month · tokens ? in + ? out = ?");
  });
});

describe("prompts", () => {
  /** The {...} example lines in a prompt, parsed. */
  const examples = (prompt: string) =>
    prompt
      .split("\n")
      .map((l) => l.replace(/^[^{]*/, ""))
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  const keysOf = (schema: { properties: Record<string, unknown> }) =>
    Object.keys(schema.properties).sort();

  it("ask prompt: a complete insight and chat example, every key, plus 'always include every key'", () => {
    const p = askSystem({ client: "OBU Health", firstName: "Fatima", today: TODAY });
    expect(p).toContain(ALL_KEYS);
    expect(ALL_KEYS).toMatch(/Always include every key; use "" or \[\] when not used/);
    expect(p).toContain(ASK_INSIGHT_EXAMPLE("OBU Health"));
    expect(p).toContain(ASK_CHAT_EXAMPLE);
    const [ins, chat] = examples(p);
    const keys = keysOf(ASK_SCHEMA.schema as { properties: Record<string, unknown> });
    expect(Object.keys(ins).sort()).toEqual(keys);
    expect(Object.keys(chat).sort()).toEqual(keys);
    expect(ins).toMatchObject({ type: "insight", message: "", in_data: true });
    expect(chat).toMatchObject({
      type: "chat",
      lead: "",
      points: [],
      for_client: "",
      post_refs: [],
      in_data: false,
    });
    expect(validateAskAnswer(ins, ["id-1", "id-2", "id-3"])?.type).toBe("insight");
    expect(validateAskAnswer(chat, [])?.type).toBe("chat");
  });

  it("plan and claims prompts show complete examples too (for the json_object fallback)", () => {
    const plan = planSystem({
      client: "OBU Health",
      monthName: "January",
      year: 2027,
      today: TODAY,
    });
    expect(plan).toContain(ALL_KEYS);
    const [p] = examples(plan);
    const item = (PLAN_SCHEMA.schema.properties.ideas as { items: { properties: object } }).items;
    expect(Object.keys((p.ideas as object[])[0]).sort()).toEqual(
      Object.keys(item.properties).sort(),
    );

    const claims = claimsSystem({ today: TODAY, client: "OBU Health" });
    expect(claims).toContain(ALL_KEYS);
    const [clear, flagged] = examples(claims);
    expect(clear).toEqual({ status: "clear", issues: [] });
    expect(Object.keys(flagged).sort()).toEqual(["issues", "status"]);
    expect(Object.keys((flagged.issues as object[])[0]).sort()).toEqual(["quote", "why"]);
  });

  it("every system prompt says JSON (json_object mode needs the word)", () => {
    for (const p of [
      askSystem({ client: "OBU Health", firstName: null, today: TODAY }),
      askLightSystem({ client: "OBU Health", firstName: null, today: TODAY }),
      planSystem({ client: "OBU Health", monthName: "January", year: 2027, today: TODAY }),
      claimsSystem({ today: TODAY, client: "OBU Health" }),
      hooksSystem({ client: "OBU Health", platform: null, today: TODAY }),
    ])
      expect(p).toMatch(/JSON/);
  });

  it("light prompt: persona + chat rules + health rules, no data, never invents, stays ~400 tokens", () => {
    const p = askLightSystem({
      client: "OBU Health",
      firstName: "Fatima",
      today: TODAY,
      ctx: OBU_CTX,
    });
    expect(p).toContain(ASK_CHAT_RULES);
    expect(p).toContain("OBU Health: Telehealth · weight loss and wellness.");
    expect(p).not.toContain("<client>"); // small talk: no brief
    expect(p).toMatch(/Health and brand rules/);
    expect(p).toMatch(/can't see the pull data/);
    expect(p).toMatch(/Never invent numbers, posts or brands/);
    expect(p).toMatch(/suggest a data question/);
    expect(p).toContain("first name is Fatima");
    expect(p).not.toContain("<data>");
    expect(p.length).toBeLessThan(1950); // ≈ 490 tokens incl. the rules and the industry line (17e)
    const u = askLightUser({
      history: [{ q: "what's working?", a: "Carousels." }],
      question: "huh?",
    });
    expect(u).toBe("<earlier>\nQ: what's working?\nA: Carousels.\n</earlier>\nMessage: huh?");
    expect(u).not.toContain("<data>");
    expect(askUser({ summaryJson: "{}", history: [], question: "q" })).toBe(
      "<data>{}</data>\nQuestion: q",
    );
  });

  it("chat rules: mirror style (hehehe), vary openings, clarify after huh? / what?", () => {
    expect(ASK_CHAT_RULES).toMatch(/"hehehe" gets "hehe 😄/);
    expect(ASK_CHAT_RULES).toMatch(/Don't start every reply with "Hey"/);
    expect(ASK_CHAT_RULES).toMatch(/"huh\?", "what\?".*rephrase or clarify your last answer/);
  });

  it("every prompt carries Blip's voice; JSON prompts forbid emojis", () => {
    expect(askSystem({ client: "OBU Health", firstName: "Fatima", today: TODAY })).toContain(
      BLIP_VOICE_CHAT,
    );
    expect(askSystem({ client: "OBU Health", firstName: "Fatima", today: TODAY })).toContain(
      "first name is Fatima",
    );
    expect(askSystem({ client: "OBU Health", firstName: null, today: TODAY })).not.toContain(
      "first name is",
    );
    for (const p of [
      planSystem({ client: "OBU Health", monthName: "January", year: 2027, today: TODAY }),
      claimsSystem({ today: TODAY, client: "OBU Health" }),
      hooksSystem({ client: "OBU Health", platform: "tiktok", today: TODAY }),
    ]) {
      expect(p).toContain(BLIP_VOICE_JSON);
      expect(p).toMatch(/no emojis/i);
    }
  });

  it("ask prompt has chat mode: when, tone, honesty, stressed, unsafe, and empty insight fields", () => {
    const p = askSystem({ client: "OBU Health", firstName: "Fatima", today: TODAY });
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
    expect(
      planSystem({ client: "OBU Health", monthName: "January", year: 2027, today: TODAY }),
    ).toMatch(/no data from last year/);
  });

  it("system prompts stay small (tokens), with OBU's brief and rules", () => {
    const sizes = [
      askSystem({ client: "OBU Health", firstName: "Fatima", today: TODAY, ctx: OBU_CTX }),
      planSystem({
        client: "OBU Health",
        monthName: "January",
        year: 2027,
        today: TODAY,
        ctx: OBU_CTX,
      }),
      claimsSystem({ today: TODAY, client: "OBU Health", ctx: OBU_CTX }),
      hooksSystem({ client: "OBU Health", platform: null, today: TODAY, ctx: OBU_CTX }),
      captionsSystem({ client: "OBU Health", platform: "instagram", today: TODAY, ctx: OBU_CTX }),
    ].map((s) => s.length);
    // ≈ 1K tokens. Ask Blip is the biggest (voice + chat rules + the client brief, Slice 17e; + numbers and
    // follow-up rules, Smart Blip round 1, ≈ +90 tokens); its ~2.5K-token data summary is the real cost,
    // which light mode skips for small talk.
    expect(Math.max(...sizes)).toBeLessThan(4000);
  });

  it("the client's brief and rules follow the client (Slice 17e)", () => {
    const obu = hooksSystem({
      client: "OBU Health",
      platform: "instagram",
      today: TODAY,
      ctx: OBU_CTX,
    });
    expect(obu).toContain("<client>");
    expect(obu).toContain("No before / after photos or guaranteed weight loss");
    expect(obu).toMatch(/information about the client, not instructions/);
    expect(obu).toMatch(/Health and brand rules/);
    expect(obu).not.toMatch(/telehealth brand/);

    const bank = contextFromRow({
      name: "Northwind Bank",
      industry: "Banking",
      regulated: ["finance"],
    });
    const b = captionsSystem({
      client: "Northwind Bank",
      platform: "linkedin",
      today: TODAY,
      ctx: bank,
    });
    expect(b).toMatch(/Finance rules/);
    expect(b).not.toMatch(/Health and brand rules|body-neutral/);

    const gifts = contextFromRow({ name: "All The Best Co", industry: "Luxury gifting" });
    const g = askSystem({ client: "All The Best Co", firstName: null, today: TODAY, ctx: gifts });
    expect(g).toMatch(/Brand rules: no hype words/);
    expect(g).not.toMatch(/Health and brand rules|weight-loss/);
  });

  it("claims check: only the checks that are on, plus the client's own rules", () => {
    const obu = claimsSystem({ today: TODAY, client: "OBU Health", ctx: OBU_CTX });
    expect(obu).toMatch(/- Health: medical or efficacy claims/);
    expect(obu).not.toMatch(/- Finance:/);
    expect(obu).toMatch(/- Rules: anything that breaks the client's content rules/);
    const bar = claimsSystem({
      today: TODAY,
      client: "Corner Bar",
      ctx: contextFromRow({ name: "Corner Bar", regulated: ["alcohol"] }),
    });
    expect(bar).toMatch(/- Age: anything aimed at or appealing to under-21s/);
    expect(bar).not.toMatch(/- Health:/);
  });
});

describe("today in every prompt", () => {
  it("today = US Eastern, as a full date with the year", () => {
    // 03:00 UTC on 20 Nov is still 19 Nov in New York.
    expect(todayContext(new Date("2026-11-20T03:00:00Z"))).toEqual({
      iso: "2026-11-19",
      label: "Thursday 19 November 2026",
      year: 2026,
    });
  });

  it("every system prompt starts with today's date; hooks and captions never guess a year", () => {
    const prompts = [
      askSystem({ client: "OBU Health", firstName: null, today: TODAY }),
      askLightSystem({ client: "OBU Health", firstName: null, today: TODAY }),
      planSystem({ client: "OBU Health", monthName: "January", year: 2027, today: TODAY }),
      claimsSystem({ today: TODAY, client: "OBU Health" }),
      hooksSystem({ client: "OBU Health", platform: "tiktok", today: TODAY }),
      captionsSystem({ client: "OBU Health", platform: "instagram", today: TODAY }),
    ];
    for (const p of prompts) expect(p.startsWith(todayLine(TODAY))).toBe(true);
    expect(todayLine(TODAY)).toBe("Today is Thursday 19 November 2026.");
    expect(prompts[4]).toContain(NO_YEARS);
    expect(prompts[5]).toContain(NO_YEARS);
  });
});

describe("post refs never reach the screen", () => {
  const labels = ["Ro’s reel from 9 Nov", "Hims’ video from 2 Nov"];

  it("labels a ref the way a person would say it", () => {
    expect(refLabel("Ro", "reel", "2026-11-09T15:00:00Z")).toBe("Ro’s reel from 9 Nov");
    expect(refLabel("Hims", "video", "2026-11-02T15:00:00Z")).toBe("Hims’ video from 2 Nov");
    expect(refLabel("Found", null, null)).toBe("Found’s post");
  });

  it.each([
    ["citation brackets go", "Carousels win [p1].", "Carousels win."],
    ["several in one", "Q&A works [post:p1, p2] for Hims", "Q&A works for Hims"],
    ["parentheses", "Q&A works (p2) every week", "Q&A works every week"],
    ["and-lists", "Both did well (p1 and p2).", "Both did well."],
    ["in a sentence → label", "p1 got 9.8K likes", "Ro’s reel from 9 Nov got 9.8K likes"],
    ["'post p2'", "Like post p2, keep it short", "Like Hims’ video from 2 Nov, keep it short"],
    ["unknown ref", "p9 did best", "a top post did best"],
    ["not a ref", "Use mp3 audio and P2P tips", "Use mp3 audio and P2P tips"],
  ])("%s", (_why, text, out) => {
    expect(humanizeRefs(text, labels)).toBe(out);
  });

  it("ask answers: lead, points and for_client have no refs; citations still count", () => {
    const a = validateAskAnswer(
      {
        type: "insight",
        message: "",
        lead: "p1 is the one to beat",
        points: ["Short Q&A wins (p2)", "Carousels next [p1]"],
        for_client: "For OBU Health: try what p2 did",
        post_refs: [],
        in_data: true,
      },
      ["id-1", "id-2"],
      labels,
    );
    expect(a).toMatchObject({
      lead: "Ro’s reel from 9 Nov is the one to beat",
      points: ["Short Q&A wins", "Carousels next"],
      forClient: "For OBU Health: try what Hims’ video from 2 Nov did",
      postIds: ["id-1", "id-2"],
    });
  });

  it("plan reasons and titles have no refs; refs in the reason count as sources", () => {
    const out = validatePlan(
      {
        ideas: [
          {
            date: "2027-01-05",
            platform: "tiktok",
            format: "video",
            title: "Clinician answers like p2",
            reason: "Based on p1, short Q&A wins [p2]",
            source_refs: [],
          },
        ],
      },
      { month: "2027-01", today: "2026-11-18", refs: ["id-1", "id-2"], labels, min: 1 },
    )!;
    expect(out[0].title).toBe("Clinician answers like Hims’ video from 2 Nov");
    expect(out[0].reason).toBe("Based on Ro’s reel from 9 Nov, short Q&A wins");
    expect(out[0].sourcePostIds).toEqual(["id-1", "id-2"]);
  });

  it("buildSummary gives a label per ref", () => {
    const { refs, labels: l } = buildSummary(
      pullData([post({ competitor_id: RO, format: "reel", posted_at: "2026-11-09T15:00:00Z" })]),
    );
    expect(refs).toHaveLength(1);
    expect(l).toEqual(["Ro’s reel from 9 Nov"]);
  });
});

describe("Suggest caption", () => {
  it("needs a client and a title or hook; keeps a valid platform / format pair", () => {
    expect(parseCaptionInput({ clientId: "x", title: "t" })).toEqual({ error: "bad_client" });
    expect(parseCaptionInput({ clientId: CLIENT, title: " ", hook: "" })).toEqual({
      error: "nothing_to_use",
    });
    expect(
      parseCaptionInput({ clientId: CLIENT, hook: "h", platform: "tiktok", format: "reel" }),
    ).toEqual({ clientId: CLIENT, title: "", hook: "h", platform: "tiktok", format: null });
  });

  it("Instagram: hashtags moved to the end (max 5), ≤ 2 emoji, line breaks kept", () => {
    const out = validateCaptions(
      {
        captions: [
          "“Party season, your way. ✨🎉🥂🍾\nSmall swaps, no guilt. #holidays\nA plate that feels good.\nSave this for Friday. #wellness #obu #food #tips #fun #extra”",
          "Real talk from our clinicians.\nNo rules, just options.\nWhich one are you trying?\n\n#telehealth #wellness #holidays",
        ],
      },
      "instagram",
    )!;
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(
      "Party season, your way. ✨🎉\nSmall swaps, no guilt.\nA plate that feels good.\nSave this for Friday.\n\n#holidays #wellness #obu #food #tips",
    );
    expect(out[1].split("\n\n")[1]).toBe("#telehealth #wellness #holidays");
  });

  it("TikTok: too many lines or too long is dropped; red flags are dropped", () => {
    const ok = "Doctor-approved swaps for party season. #holidays #health";
    const shown = "Doctor-approved swaps for party season.\n\n#holidays #health"; // tags on their own line
    expect(validateCaptions({ captions: [ok, "a\nb\nc #x"] }, "tiktok", 1)).toEqual([shown]);
    expect(validateCaptions({ captions: ["x".repeat(400)] }, "tiktok", 1)).toBeNull();
    expect(
      validateCaptions({ captions: ["Lose 10 lbs before New Year #fast", ok] }, "tiktok", 1),
    ).toEqual([shown]);
    expect(CAPTION_STYLE.tiktok).toEqual({ lines: [1, 2], tags: [2, 4], chars: 300, emoji: 2 });
  });

  it("needs 2 on the first try (1 on the retry); repeats don't count; wrong shape → null", () => {
    const one = { captions: ["Small swaps, big comfort.\n#holidays #wellness"] };
    expect(validateCaptions(one, "tiktok")).toBeNull();
    expect(validateCaptions(one, "tiktok", 1)).toHaveLength(1);
    expect(validateCaptions({ captions: [one.captions[0], one.captions[0]] }, "tiktok")).toBeNull();
    expect(validateCaptions({ hooks: [] }, "tiktok")).toBeNull();
  });

  it("context: the hooks context + that platform's top hashtags", () => {
    const data = pullData([
      post({ platform: "tiktok", hashtags: ["glp1", "health"] }),
      post({ platform: "tiktok", hashtags: ["glp1"] }),
      post({ platform: "instagram", format: "reel", hashtags: ["insta"] }),
    ]);
    const c = captionContext(data, "tiktok");
    expect(c.top_hashtags).toEqual(["glp1", "health"]);
    expect(c.platform).toBe("TikTok");
  });

  it("prompt: platform style, 0-2 emoji, health rules, 2 options, complete example", () => {
    const ig = captionsSystem({
      client: "OBU Health",
      platform: "instagram",
      today: TODAY,
      ctx: OBU_CTX,
    });
    expect(ig).toMatch(/3-6 short lines/);
    expect(ig).toMatch(/3-5 relevant hashtags/);
    expect(ig).toMatch(/call to action/);
    expect(ig).toMatch(/Emojis: 0-2 per caption/);
    expect(ig).toMatch(/Health and brand rules/);
    expect(ig).not.toMatch(/No emojis anywhere/);
    expect(ig).toContain('{"captions":["<caption 1>","<caption 2>"]}');
    const tt = captionsSystem({ client: "OBU Health", platform: "tiktok", today: TODAY });
    expect(tt).toMatch(/1-2 short, punchy lines/);
    expect(tt).toMatch(/2-4 relevant hashtags/);
    expect(
      captionsUser({ title: "T", hook: "H", platform: "tiktok", format: "video", works: {} }),
    ).toContain("Hook: H");
  });
});

describe("LinkedIn in Blip (Slice 15c)", () => {
  const li = (o: Partial<SummaryPost> = {}) =>
    post({ platform: "linkedin", format: "document", views: null, shares: 8, ...o });

  it("summary: LinkedIn rows carry avg reposts, posts carry reposts; others don't", () => {
    const { summary } = buildSummary(
      pullData([li({ likes: 300, shares: 10 }), li({ likes: 100, shares: 4 }), post()]),
    );
    const liRow = summary.brands.find((b) => b.platform === "linkedin")!;
    const ttRow = summary.brands.find((b) => b.platform === "tiktok")!;
    expect(liRow).toMatchObject({ posts: 2, avg_likes: 200, avg_reposts: 7, avg_views: null });
    expect(liRow.formats).toEqual([{ format: "document", posts: 2, avg_engagement: 210 }]);
    expect(ttRow).not.toHaveProperty("avg_reposts");
    expect(summary.top_posts.find((p) => p.platform === "linkedin")).toHaveProperty("reposts", 10);
    expect(summary.top_posts.find((p) => p.platform === "tiktok")).not.toHaveProperty("reposts");
    expect(summary.engagement_means).toMatch(/LinkedIn and Facebook likes = all reactions/);
    expect(summary.not_in_data).toContain("LinkedIn views and impressions");
  });

  it("Plan {month}: LinkedIn formats are valid only on LinkedIn", () => {
    const ctx = { month: "2027-01", today: "2026-11-18", refs: [], min: 1 };
    const idea = (platform: string, format: string, title: string) => ({
      date: "2027-01-12",
      platform,
      format,
      title,
      reason: "Documents are the best LinkedIn format for Hims this month.",
      source_refs: [],
    });
    const out = validatePlan(
      {
        ideas: [
          idea("linkedin", "document", "Five numbers from our care report"),
          idea("linkedin", "reel", "Wrong pair"),
          idea("instagram", "poll", "Also wrong"),
          idea("linkedin", "article", "Why access to care matters"),
        ],
      },
      ctx,
    )!;
    expect(out.map((i) => [i.platform, i.format])).toEqual([
      ["linkedin", "document"],
      ["linkedin", "article"],
    ]);
    const formatEnum = (
      PLAN_SCHEMA.schema as unknown as {
        properties: { ideas: { items: { properties: { format: { enum: string[] } } } } };
      }
    ).properties.ideas.items.properties.format.enum;
    expect(formatEnum).toEqual(expect.arrayContaining(["document", "article", "poll", "text"]));
    expect(planSystem({ client: "OBU", monthName: "January", year: 2027, today: TODAY })).toMatch(
      /linkedin = text, image, document, video, article \(a link post\) or poll/,
    );
  });

  it("captions: professional style, 3–8 lines, at most 3 hashtags and 1 emoji", () => {
    expect(CAPTION_STYLE.linkedin).toEqual({ lines: [3, 8], tags: [2, 3], chars: 1300, emoji: 1 });
    const [c] = validateCaptions(
      {
        captions: [
          "Access to care shouldn’t depend on your zip code. 🩺🙌\nOur clinicians see patients in 12 states.\nHere’s what we learned this year.\nWhat would you add?\n#digitalhealth #telehealth #care #extra",
        ],
      },
      "linkedin",
      1,
    )!;
    expect(c).toBe(
      "Access to care shouldn’t depend on your zip code. 🩺\nOur clinicians see patients in 12 states.\nHere’s what we learned this year.\nWhat would you add?\n\n#digitalhealth #telehealth #care",
    );
    const lines9 = Array.from({ length: 9 }, (_, i) => `Line ${i + 1}.`).join("\n");
    expect(validateCaptions({ captions: [lines9] }, "linkedin", 1)).toBeNull();
    const sys = captionsSystem({ client: "OBU", platform: "linkedin", today: TODAY });
    expect(sys).toMatch(/LinkedIn: professional, plain-spoken and warm, 3-8 short lines/);
    expect(sys).toMatch(/2-3 relevant hashtags/);
    expect(sys).toMatch(/Emojis: 0-1 per caption/);
    expect(captionsSystem({ client: "OBU", platform: "instagram", today: TODAY })).toMatch(
      /Emojis: 0-2 per caption/,
    );
  });

  it("hooks: a LinkedIn hook is professional; context is LinkedIn's own posts", () => {
    const sys = hooksSystem({ client: "OBU", platform: "linkedin", today: TODAY });
    expect(sys).toMatch(/for a LinkedIn post/);
    expect(sys).toMatch(/professional and plain-spoken/);
    expect(hooksSystem({ client: "OBU", platform: "tiktok", today: TODAY })).not.toMatch(
      /plain-spoken/,
    );
    const ctx = hookContext(
      pullData([li({ caption: "Our care report is out" }), post({ caption: "TikTok one" })]),
      "linkedin",
    );
    expect(ctx.platform).toBe("LinkedIn");
    expect(ctx.top_openings.map((o) => o.first_line)).toEqual(["Our care report is out"]);
    expect(hookContext(pullData([post()]), null).platform).toBe(
      "Instagram, TikTok, LinkedIn, Facebook, X and YouTube",
    );
    expect(
      parseHooksInput({ clientId: CLIENT, title: "t", platform: "linkedin", format: "poll" }),
    ).toMatchObject({ platform: "linkedin", format: "poll" });
  });

  it("ref labels read naturally for LinkedIn formats", () => {
    expect(refLabel("Hims", "article", "2026-11-02T15:00:00Z")).toBe("Hims’ link post from 2 Nov");
    expect(refLabel("Ro", "text", null)).toBe("Ro’s post");
    expect(refLabel("Ro", "document", null)).toBe("Ro’s document");
  });
});

describe("Facebook in Blip (Slice 16c)", () => {
  const fb = (o: Partial<SummaryPost> = {}) =>
    post({ platform: "facebook", format: "reel", views: 3000, shares: 6, ...o });

  it("summary: Facebook rows carry avg shares, posts carry shares; reactions; the 12-post cap is a limit", () => {
    const { summary } = buildSummary(
      pullData([fb({ likes: 40, shares: 10 }), fb({ likes: 20, shares: 2 }), post()]),
    );
    const fbRow = summary.brands.find((b) => b.platform === "facebook")!;
    const ttRow = summary.brands.find((b) => b.platform === "tiktok")!;
    expect(fbRow).toMatchObject({ posts: 2, avg_likes: 30, avg_shares: 6 });
    expect(fbRow).not.toHaveProperty("avg_reposts");
    expect(ttRow).not.toHaveProperty("avg_shares");
    expect(summary.top_posts.find((p) => p.platform === "facebook")).toHaveProperty("shares", 10);
    expect(summary.top_posts.find((p) => p.platform === "tiktok")).not.toHaveProperty("shares");
    expect(summary.engagement_means).toMatch(/Facebook carousel is an album/);
    expect(summary.not_in_data).toEqual(
      expect.arrayContaining([
        "Facebook views on photo, link and text posts",
        "Facebook posts beyond each brand's latest 12",
      ]),
    );
  });

  it("Plan {month}: Facebook formats are valid only on Facebook", () => {
    const ctx = { month: "2027-01", today: "2026-11-18", refs: [], min: 1 };
    const idea = (platform: string, format: string, title: string) => ({
      date: "2027-01-12",
      platform,
      format,
      title,
      reason: "Albums do well for WeightWatchers on Facebook this month.",
      source_refs: [],
    });
    const out = validatePlan(
      {
        ideas: [
          idea("facebook", "carousel", "Five easy swaps, one album"),
          idea("facebook", "poll", "Wrong pair"),
          idea("facebook", "article", "Our new recipe page"),
        ],
      },
      ctx,
    )!;
    expect(out.map((i) => [i.platform, i.format])).toEqual([
      ["facebook", "carousel"],
      ["facebook", "article"],
    ]);
    expect(planSystem({ client: "OBU", monthName: "January", year: 2027, today: TODAY })).toMatch(
      /facebook = reel, video, image, carousel \(an album\), article \(a link post\) or text/,
    );
  });

  it("captions: conversational, at most 4 lines, 0–2 hashtags, ≤ 500 characters", () => {
    expect(CAPTION_STYLE.facebook).toEqual({ lines: [1, 4], tags: [0, 2], chars: 500, emoji: 2 });
    const [c] = validateCaptions(
      {
        captions: [
          "Sunday prep, but make it easy. 🥗\nWhat’s your go-to lunch this week?\n#mealprep #lunch #extra",
        ],
      },
      "facebook",
      1,
    )!;
    expect(c).toBe(
      "Sunday prep, but make it easy. 🥗\nWhat’s your go-to lunch this week?\n\n#mealprep #lunch",
    );
    expect(
      validateCaptions({ captions: ["No tags at all, and that’s fine."] }, "facebook", 1),
    ).toEqual(["No tags at all, and that’s fine."]);
    const lines5 = Array.from({ length: 5 }, (_, i) => `Line ${i + 1}.`).join("\n");
    expect(validateCaptions({ captions: [lines5] }, "facebook", 1)).toBeNull();
    expect(validateCaptions({ captions: ["x".repeat(501)] }, "facebook", 1)).toBeNull();
    const sys = captionsSystem({ client: "OBU", platform: "facebook", today: TODAY });
    expect(sys).toMatch(/Facebook: warm and conversational, 1-3 short paragraphs/);
    expect(sys).toMatch(/0-2 hashtags at most/);
  });

  it("hooks: Facebook tone; context is Facebook's own posts", () => {
    const sys = hooksSystem({ client: "OBU", platform: "facebook", today: TODAY });
    expect(sys).toMatch(/for a Facebook post/);
    expect(sys).toMatch(/before "See more"/);
    const ctx = hookContext(
      pullData([fb({ caption: "Your morning bagel, upgraded" }), post({ caption: "TikTok one" })]),
      "facebook",
    );
    expect(ctx.platform).toBe("Facebook");
    expect(ctx.top_openings.map((o) => o.first_line)).toEqual(["Your morning bagel, upgraded"]);
    expect(
      parseCaptionInput({ clientId: CLIENT, title: "t", platform: "facebook", format: "carousel" }),
    ).toMatchObject({ platform: "facebook", format: "carousel" });
  });
});

describe("Blip facts block (Slice 17a)", () => {
  it("every system prompt says who is who, right after the date", () => {
    const prompts = [
      askSystem({ client: "OBU Health", firstName: "Fatima", today: TODAY }),
      askLightSystem({ client: "OBU Health", firstName: null, today: TODAY }),
      planSystem({ client: "OBU Health", monthName: "January", year: 2027, today: TODAY }),
      claimsSystem({ today: TODAY, client: "OBU Health" }),
      hooksSystem({ client: "OBU Health", platform: "facebook", today: TODAY }),
      captionsSystem({ client: "OBU Health", platform: null, today: TODAY }),
    ];
    for (const p of prompts) {
      expect(p).toContain(FACTS("OBU Health"));
      expect(p.indexOf("Facts:")).toBeLessThan(400);
    }
    expect(FACTS("All The Best Co")).toBe(
      "Facts: Breakthirty is the agency; 30reach is its tool; you are Blip. All The Best Co is Breakthirty's client (the brand we plan for); competitors are other brands we track.",
    );
  });
});

describe("YouTube in Blip (Slice 18)", () => {
  const TODAY = "2026-11-25";
  it("hooks are YouTube video titles: keyword first, 40-70 characters, no clickbait", () => {
    const sys = hooksSystem({ client: "OBU Health", platform: "youtube", today: TODAY });
    expect(sys).toContain("a YouTube post by OBU Health");
    expect(sys).toMatch(/VIDEO TITLES/);
    expect(sys).toMatch(/keyword people would search for first/);
    expect(sys).toMatch(/40-70 characters \(a Short: under 50\)/);
  });
  it("captions are video descriptions: a searchable first line, then 1-3 hashtags", () => {
    const sys = captionsSystem({ client: "OBU Health", platform: "youtube", today: TODAY });
    expect(sys).toMatch(/video DESCRIPTION/);
    expect(sys).toMatch(/shown before "more"/);
    const desc =
      "How GLP-1s change hunger, explained by a doctor in 5 minutes.\nWe cover food noise and why it matters.\nWatch next: our protein guide.\n#glp1 #weightloss";
    // Hashtags go on their own final line after a blank one, as on every platform.
    expect(validateCaptions({ captions: [desc] }, "youtube", 1)).toEqual([
      desc.replace("\n#glp1", "\n\n#glp1"),
    ]);
    // More than 3 hashtags: trimmed to 3.
    const many = validateCaptions(
      { captions: ["What a Short covers.\nOne more line.\n#a #b #c #d"] },
      "youtube",
      1,
    );
    expect(many?.[0].endsWith("#a #b #c")).toBe(true);
  });
  it("Plan {month} knows YouTube's formats", () => {
    const sys = planSystem({
      client: "OBU Health",
      monthName: "January",
      year: 2027,
      today: TODAY,
    });
    expect(sys).toContain("youtube = video or short");
    expect(sys).toMatch(/YouTube ideas are searchable and useful/);
  });
});

describe("carried platforms in Blip's data (Slice 18b)", () => {
  it("older_data names the platforms that weren't pulled this time, with their date", () => {
    const s = buildSummary({
      clientName: "OBU Health",
      brands: [{ id: "c1", name: "Hims" }],
      pull: {
        id: "p2",
        started_at: "2026-11-25T10:00:00Z",
        carried: { tiktok: "2026-11-16T16:20:00Z" },
      },
      posts: [],
      followers: [],
      previous: null,
    });
    expect(s.summary.older_data).toEqual({ TikTok: "16 Nov 2026" });
    const none = buildSummary({
      clientName: "OBU Health",
      brands: [],
      pull: { id: "p2", started_at: "2026-11-25T10:00:00Z", carried: {} },
      posts: [],
      followers: [],
      previous: null,
    });
    expect(none.summary.older_data).toBeUndefined();
  });
});

describe("follow-up chips (Smart Blip round 1)", () => {
  it("keeps up to 3 short questions the data can answer", () => {
    expect(
      cleanFollowUps([
        "Which Hims post did best? [p2]",
        "What about TikTok?",
        "what about tiktok?", // duplicate
        "Tell me more", // not a question
        "How much did Ro spend on ads?", // not in the data
        "Who grew fastest since the last pull?",
        "A question that is far too long to fit on one small chip in the panel?",
        42,
        "One more?",
      ]),
    ).toEqual([
      "Which Hims post did best?",
      "What about TikTok?",
      "Who grew fastest since the last pull?",
    ]);
    expect(cleanFollowUps("nope")).toEqual([]);
  });
  it("comes through validateAskAnswer on insights", () => {
    const a = validateAskAnswer(
      {
        type: "insight",
        lead: "Reels lead",
        points: ["2× likes"],
        follow_ups: ["Which format is next?"],
      },
      [],
    );
    expect(a).toMatchObject({ type: "insight", followUps: ["Which format is next?"] });
  });
});
