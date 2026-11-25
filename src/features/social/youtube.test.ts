import { describe, expect, it } from "vitest";
import { cardMeta, FORMATS } from "../calendar/calendar-ui";
import { parseHandle } from "../competitors/competitor-rules";
import { competitorRowsForCreate, type ParseAccount } from "../clients/add/add-client-rules";
import { formatLabel, platformFromUrl } from "../ideas/idea-rules";
import { clockDuration, type OverviewPost, postStats } from "../overview/metrics";
import { withoutExpiredYouTube } from "../overview/useOverviewData";
import { manualPlatformRows } from "../../lib/client-rules";
import { PLATFORM_FILL, PLATFORM_SHORT_NAME } from "../../lib/platforms";

/* Slice 18: YouTube in the app (pages, calendar, ideas, Add client). */

const post = (o: Partial<OverviewPost>): OverviewPost => ({
  id: "p1",
  competitor_id: "c1",
  platform: "youtube",
  external_id: "In4-6SVSDZ0",
  url: "https://www.youtube.com/shorts/In4-6SVSDZ0",
  posted_at: "2026-11-14T06:14:47Z",
  format: "short",
  caption: "Julie Rice on what Weight Watchers is in the era of GLP-1s",
  hashtags: [],
  likes: 12,
  comments: 1,
  views: 1245,
  shares: null,
  counts_hidden: false,
  thumbnail_path: null,
  duration_seconds: 40,
  ...o,
});

describe("YouTube posts", () => {
  it("stats line: views · likes · comments · length", () => {
    expect(postStats(post({}))).toBe("1.2K views · 12 likes · 1 comment · 0:40");
    expect(
      postStats(
        post({ format: "video", views: 6190, likes: 124, comments: 6, duration_seconds: 2998 }),
      ),
    ).toBe("6.2K views · 124 likes · 6 comments · 49:58");
    expect(postStats(post({ counts_hidden: true, likes: null, duration_seconds: null }))).toBe(
      "1.2K views · likes hidden · 1 comment",
    );
  });
  it("clock durations like YouTube's", () => {
    expect(clockDuration(40)).toBe("0:40");
    expect(clockDuration(2824)).toBe("47:04");
    expect(clockDuration(3723)).toBe("1:02:03");
  });
  it("colour, short name", () => {
    expect(PLATFORM_FILL.youtube).toBe("bg-youtube");
    expect(PLATFORM_SHORT_NAME.youtube).toBe("YT");
  });
  it("YouTube data older than 30 days isn't shown (YouTube's policies)", () => {
    const posts = [post({}), post({ id: "ig", platform: "instagram", format: "reel" })];
    const now = Date.parse("2026-11-25T12:00:00Z");
    expect(withoutExpiredYouTube(posts, "2026-11-20T10:00:00Z", now)).toHaveLength(2);
    expect(withoutExpiredYouTube(posts, "2026-10-20T10:00:00Z", now).map((p) => p.id)).toEqual([
      "ig",
    ]);
    expect(withoutExpiredYouTube(posts, null, now)).toHaveLength(2);
  });
});

describe("YouTube in the calendar and ideas", () => {
  it("formats: Video and Short", () => {
    expect(FORMATS.youtube).toEqual(["video", "short"]);
    expect(cardMeta({ platform: "youtube", format: "short" })).toBe("YT · Short");
    expect(cardMeta({ platform: "youtube", format: "video" })).toBe("YT · Video");
    expect(formatLabel("short", "youtube")).toBe("Short");
  });
  it("idea links from youtube.com and youtu.be", () => {
    expect(platformFromUrl("https://www.youtube.com/shorts/In4-6SVSDZ0")).toBe("youtube");
    expect(platformFromUrl("https://youtu.be/Hm3jtqHt8tM")).toBe("youtube");
    expect(platformFromUrl("https://m.youtube.com/watch?v=Hm3jtqHt8tM")).toBe("youtube");
  });
});

describe("YouTube in Add client", () => {
  it("manual client: YouTube tracked only when a handle was given", () => {
    expect(manualPlatformRows({}).map((r) => r.platform)).not.toContain("youtube");
    expect(
      manualPlatformRows({ youtube: "obuhealth" }).find((r) => r.platform === "youtube"),
    ).toEqual({
      platform: "youtube",
      state: "on",
      source: "team",
      account_url: null,
      account_handle: "obuhealth",
    });
  });
  it("competitors: a site's @handle, a /channel/ link, or a typed handle", () => {
    const parse: ParseAccount = (p, v) => {
      const r = parseHandle(p, v);
      return r.kind === "ok" ? { value: r.handle } : { value: null };
    };
    const base = { about: "", website: "", domain: "", ticked: true, inputs: {} };
    const rows = competitorRowsForCreate(
      {
        competitors: [
          {
            ...base,
            key: "a",
            name: "Alpha",
            accounts: [{ platform: "youtube", handle: "alpha", url: null }],
          },
          {
            ...base,
            key: "b",
            name: "Beta",
            accounts: [
              {
                platform: "youtube",
                handle: null,
                url: "https://www.youtube.com/channel/UC7AWNWptGGpybSgZbV34yBw",
              },
            ],
          },
          {
            ...base,
            key: "c",
            name: "Gamma",
            accounts: [
              { platform: "youtube", handle: null, url: "https://www.youtube.com/c/Gamma" },
            ],
            inputs: { youtube: "@gamma_tv" },
          },
        ],
      } as unknown as Parameters<typeof competitorRowsForCreate>[0],
      parse,
    );
    expect(rows.map((r) => [r.name, r.youtube_handle])).toEqual([
      ["Alpha", "alpha"],
      ["Beta", "UC7AWNWptGGpybSgZbV34yBw"],
      ["Gamma", "gamma_tv"], // an old /c/ link can't be used: the typed handle is
    ]);
  });
});
