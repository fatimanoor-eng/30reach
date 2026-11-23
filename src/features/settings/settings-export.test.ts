import { describe, expect, it } from "vitest";
import { cardsCsv, eventsCsv, eventsWindow, ideasCsv, postsCsv } from "./settings-export";

const lines = (csv: string) =>
  (csv.startsWith("\uFEFF") ? csv.slice(1) : csv).trimEnd().split("\r\n");

describe("Settings exports", () => {
  it("posts: brand names, newest first, hidden counts blank, hashtags with #", () => {
    const csv = postsCsv(
      [
        {
          competitor_id: "c-ro",
          platform: "instagram",
          format: "reel",
          posted_at: "2026-11-09T15:00:00Z",
          url: "https://example.com/1",
          caption: "Small swaps, big comfort",
          hashtags: ["holidays"],
          likes: 3400,
          comments: 50,
          views: null,
          shares: null,
          counts_hidden: false,
        },
        {
          competitor_id: "c-hims",
          platform: "tiktok",
          format: "video",
          posted_at: "2026-11-12T15:00:00Z",
          url: "https://example.com/2",
          caption: null,
          hashtags: null,
          likes: 0,
          comments: 0,
          views: 212000,
          shares: 31,
          counts_hidden: true,
        },
        {
          competitor_id: "c-hims",
          platform: "linkedin",
          format: "article",
          posted_at: "2026-11-01T15:00:00Z",
          url: "https://www.linkedin.com/feed/update/1/",
          caption: "Our care report",
          hashtags: ["digitalhealth"],
          likes: 700,
          comments: 23,
          views: null,
          shares: 12,
          counts_hidden: false,
        },
      ],
      [
        { id: "c-ro", name: "Ro" },
        { id: "c-hims", name: "Hims" },
      ],
      "2026-11-17T15:00:00Z",
    );
    const [head, first, second, third] = lines(csv);
    expect(head).toBe(
      "Brand,Platform,Format,Posted at (UTC),Likes / reactions,Comments,Views,Shares / reposts,Counts hidden,Caption,Hashtags,Link,Pull from (UTC)",
    );
    expect(first).toBe(
      "Hims,tiktok,video,2026-11-12T15:00:00Z,,,212000,31,yes,,,https://example.com/2,2026-11-17T15:00:00Z",
    );
    expect(second).toContain("Ro,instagram,reel,");
    expect(second).toContain(',3400,50,,,no,"Small swaps, big comfort",#holidays,');
    // LinkedIn (Slice 15c): reactions in the likes column, reposts in shares, no views.
    expect(third).toContain("Hims,linkedin,article,2026-11-01T15:00:00Z,700,23,,12,no,");
  });

  it("ideas: Blip for AI ideas, planned date, suggested date, link from the post", () => {
    const csv = ideasCsv([
      {
        created_at: "2026-11-16T10:00:00Z",
        kind: "ai",
        note: "Clinician answers",
        link_url: null,
        platform: "tiktok",
        format: "video",
        tags: ["Q&A", "series"],
        source_snapshot: { suggested_date: "2026-12-31" },
        creator: null,
        planned: { date: "2026-12-31" },
      },
    ]);
    expect(lines(csv)[1]).toBe(
      '2026-11-16T10:00:00Z,ai,Clinician answers,tiktok,video,"Q&A, series",,,2026-12-31,2026-12-31,Blip',
    );
  });

  it("cards: by date, every text field", () => {
    const card = (date: string, title: string) => ({
      date,
      title,
      platform: "tiktok",
      format: "video",
      status: "drafting",
      hook: "Hook",
      caption: "Line 1\nLine 2",
      visual_idea: null,
      origin: "manual",
      compliance_status: "clear",
      updated_at: "2026-11-17T10:00:00Z",
      creator: { full_name: "Fatima Noor" },
    });
    const rows = lines(cardsCsv([card("2026-12-09", "B"), card("2026-12-04", "A")]));
    expect(rows[1].startsWith("2026-12-04,A,")).toBe(true);
    expect(rows[1]).toContain('Hook,"Line 1\nLine 2",,manual,clear,Fatima Noor,');
  });

  it("events: by start date, kinds in words", () => {
    const csv = eventsCsv([
      {
        id: "2",
        kind: "health",
        name: "Diabetes Awareness Month",
        start: "2026-11-01",
        end: "2026-11-30",
      },
      {
        id: "1",
        kind: "holiday",
        name: "Thanksgiving Day",
        start: "2026-11-26",
        end: "2026-11-26",
      },
      { id: "3", kind: "marketing", name: "Black Friday", start: "2026-11-27", end: "2026-11-27" },
    ]);
    expect(lines(csv)).toEqual([
      "Start,End,Name,Kind",
      "2026-11-01,2026-11-30,Diabetes Awareness Month,Health month",
      "2026-11-26,2026-11-26,Thanksgiving Day,Holiday",
      "2026-11-27,2026-11-27,Black Friday,Marketing date",
    ]);
  });

  it("events window: this month + the next 3, across the year end", () => {
    expect(eventsWindow("2026-11-20")).toEqual({
      from: "2026-11-01",
      to: "2027-02-28",
      years: [2026, 2027],
    });
    expect(eventsWindow("2026-03-05")).toEqual({
      from: "2026-03-01",
      to: "2026-06-30",
      years: [2026],
    });
    expect(eventsWindow("2027-12-01").to).toBe("2028-03-31");
  });
});
