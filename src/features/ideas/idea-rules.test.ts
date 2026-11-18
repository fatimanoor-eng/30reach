import { describe, expect, it } from "vitest";
import {
  addTag,
  cleanTag,
  filterIdeas,
  ideaAge,
  ideaAuthor,
  ideaText,
  linkLabel,
  looksLikeUrl,
  MAX_TAGS,
  normaliseUrl,
  platformFromUrl,
  plannedLabel,
  tabCounts,
  type Idea,
} from "./idea-rules";

const idea = (id: string, extra: Partial<Idea> = {}): Idea => ({
  id,
  kind: "note",
  note: null,
  image_path: null,
  link_url: null,
  source_snapshot: null,
  platform: null,
  format: null,
  tags: [],
  planned_card_id: null,
  created_at: "2026-11-17T12:00:00Z",
  creator: { full_name: "Fatima Noor" },
  planned: null,
  ...extra,
});

const IDEAS = [
  idea("a", { kind: "screenshot", note: "Day in my life on a plan", tags: ["Trend", "Video"] }),
  idea("b", { kind: "link", link_url: "https://www.tiktok.com/@creator", note: "Great hook" }),
  idea("c", { kind: "note", note: "Ask a clinician Tuesdays", tags: ["Series"] }),
  idea("d", {
    kind: "post",
    source_snapshot: { brand: "Hers", caption: "3 things nobody tells you" },
  }),
  idea("e", { kind: "ai", note: "Weekly clinician Q&A" }),
  idea("f", { kind: "screenshot", note: "Carousel cover" }),
];

describe("tabs and search", () => {
  it("counts each kind and the total", () => {
    expect(tabCounts(IDEAS)).toEqual({
      all: 6,
      screenshot: 2,
      link: 1,
      note: 1,
      post: 1,
      ai: 1,
    });
  });

  it("filters by tab", () => {
    expect(filterIdeas(IDEAS, "screenshot", "").map((i) => i.id)).toEqual(["a", "f"]);
    expect(filterIdeas(IDEAS, "all", "")).toHaveLength(6);
  });

  it("searches note, tags, link, brand and caption, ignoring case", () => {
    expect(filterIdeas(IDEAS, "all", "CLINICIAN").map((i) => i.id)).toEqual(["c", "e"]);
    expect(filterIdeas(IDEAS, "all", "series").map((i) => i.id)).toEqual(["c"]);
    expect(filterIdeas(IDEAS, "all", "tiktok.com").map((i) => i.id)).toEqual(["b"]);
    expect(filterIdeas(IDEAS, "all", "hers").map((i) => i.id)).toEqual(["d"]);
    expect(filterIdeas(IDEAS, "all", "nobody").map((i) => i.id)).toEqual(["d"]);
  });

  it("needs every word to match, and combines with the tab", () => {
    expect(filterIdeas(IDEAS, "all", "clinician tuesdays").map((i) => i.id)).toEqual(["c"]);
    expect(filterIdeas(IDEAS, "ai", "clinician").map((i) => i.id)).toEqual(["e"]);
    expect(filterIdeas(IDEAS, "link", "clinician")).toEqual([]);
  });
});

describe("tags", () => {
  it("cleans spaces and length", () => {
    expect(cleanTag("  Look   &  feel ")).toBe("Look & feel");
    expect(cleanTag("   ")).toBeNull();
    expect(cleanTag("x".repeat(40))).toHaveLength(24);
  });

  it("skips duplicates in any case, blanks, and stops at the limit", () => {
    expect(addTag(["Trend"], "trend")).toEqual(["Trend"]);
    expect(addTag(["Trend"], " ")).toEqual(["Trend"]);
    expect(addTag(["Trend"], "Hook")).toEqual(["Trend", "Hook"]);
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
    expect(addTag(full, "one more")).toBe(full);
  });
});

describe("links", () => {
  it("adds https and rejects things that aren't web links", () => {
    expect(normaliseUrl("instagram.com/p/abc")).toBe("https://instagram.com/p/abc");
    expect(normaliseUrl("http://example.com")).toBe("http://example.com/");
    expect(normaliseUrl("hello")).toBeNull();
    expect(normaliseUrl("two words.com")).toBeNull();
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("mailto:a@b.com")).toBeNull();
    expect(normaliseUrl("")).toBeNull();
  });

  it("only treats text that starts like a link as a pasted link", () => {
    expect(looksLikeUrl("https://www.tiktok.com/@creator")).toBe(true);
    expect(looksLikeUrl("www.instagram.com/p/abc")).toBe(true);
    expect(looksLikeUrl("see instagram.com")).toBe(false);
    expect(looksLikeUrl("just a note")).toBe(false);
  });

  it("shows the domain and first path part (Figma 14b)", () => {
    expect(linkLabel("https://www.tiktok.com/@creator")).toBe("tiktok.com/@creator");
    expect(linkLabel("https://www.instagram.com/p/C0abc/")).toBe("instagram.com/p/…");
    expect(linkLabel("https://example.com/")).toBe("example.com");
  });

  it("knows Instagram and TikTok links", () => {
    expect(platformFromUrl("https://www.instagram.com/p/x")).toBe("instagram");
    expect(platformFromUrl("https://vm.tiktok.com/abc")).toBe("tiktok");
    expect(platformFromUrl("https://nottiktok.com/abc")).toBeNull();
    expect(platformFromUrl("https://example.com")).toBeNull();
  });
});

describe("card footer", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const ago = (days: number) => new Date(now - days * 86_400_000 - 60_000).toISOString();

  it("says how long ago, long form (14b)", () => {
    expect(ideaAge(new Date(now - 3_600_000).toISOString(), now)).toBe("TODAY");
    expect(ideaAge(ago(1), now)).toBe("YESTERDAY");
    expect(ideaAge(ago(2), now)).toBe("2 DAYS AGO");
    expect(ideaAge(ago(7), now)).toBe("1 WEEK AGO");
    expect(ideaAge(ago(14), now)).toBe("2 WEEKS AGO");
    expect(ideaAge("2026-09-01T12:00:00Z", now)).toBe("1 SEP");
  });

  it("says how long ago, short form (M09)", () => {
    expect(ideaAge(ago(2), now, true)).toBe("2D");
    expect(ideaAge(ago(7), now, true)).toBe("1W");
    expect(ideaAge(ago(0), now, true)).toBe("TODAY");
  });

  it("names the author", () => {
    expect(ideaAuthor({ kind: "note", creator: { full_name: "Fatima Noor" } })).toBe("FATIMA");
    expect(ideaAuthor({ kind: "ai", creator: null })).toBe("BLIP");
    expect(ideaAuthor({ kind: "note", creator: null })).toBe("TEAM");
  });

  it("uses the note, else the source caption", () => {
    expect(ideaText({ note: " Mine ", source_snapshot: { caption: "Theirs" } })).toBe("Mine");
    expect(ideaText({ note: null, source_snapshot: { caption: "Theirs" } })).toBe("Theirs");
    expect(ideaText({ note: "", source_snapshot: null })).toBe("");
  });
});

describe("planned badge", () => {
  it("shows the calendar day, long and short", () => {
    expect(plannedLabel("2027-01-05")).toBe("Tue 5 Jan");
    expect(plannedLabel("2027-01-05", true)).toBe("5 Jan");
    expect(plannedLabel("not a day")).toBe("");
  });
});
