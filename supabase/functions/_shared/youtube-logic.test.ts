import { describe, expect, it } from "vitest";
import channelMissing from "./fixtures/youtube-channel-missing.json";
import channelWW from "./fixtures/youtube-channel-weightwatchers.json";
import shortsWW from "./fixtures/youtube-shorts-weightwatchers.json";
import uploadsWW from "./fixtures/youtube-uploads-weightwatchers.json";
import videosWW from "./fixtures/youtube-videos-weightwatchers.json";
import { cutoffFor, decideNextPage, postColumns, postsInWindow } from "./pull-logic.ts";
import {
  channelFilter,
  decodeYouTubeCursor,
  encodeYouTubeCursor,
  isoDurationSeconds,
  mapYouTubeVideo,
  parseChannel,
  parseYouTubePage,
  shortFromApi,
  shortFromStatus,
  uploadsPlaylist,
  videosToCheck,
  youtubeErrorCode,
  youtubeExpiredPulls,
  youtubeLabel,
  youtubeTarget,
} from "./youtube-logic.ts";

/** The spike's URL checks for these 20 videos (youtube.com/shorts/<id>: 200 = Short). */
const URL_CHECK = Object.fromEntries(shortsWW.map((s) => [s.id, s.short]));

describe("YouTube handle / channel input", () => {
  it("handles, @handles and links", () => {
    expect(youtubeTarget("@WeightWatchers")).toBe("weightwatchers");
    expect(youtubeTarget("weightwatchers")).toBe("weightwatchers");
    expect(youtubeTarget("https://www.youtube.com/@weightwatchers/shorts")).toBe("weightwatchers");
    expect(youtubeTarget("m.youtube.com/@Hims.Hers")).toBe("hims.hers");
    expect(youtubeTarget("youtube.com/@obuhealth?si=abc")).toBe("obuhealth");
  });
  it("channel links keep the case-sensitive id", () => {
    expect(youtubeTarget("https://www.youtube.com/channel/UC7AWNWptGGpybSgZbV34yBw")).toBe(
      "UC7AWNWptGGpybSgZbV34yBw",
    );
    expect(youtubeTarget("UC7AWNWptGGpybSgZbV34yBw")).toBe("UC7AWNWptGGpybSgZbV34yBw");
  });
  it("refuses what doesn't name a channel", () => {
    expect(youtubeTarget("https://www.youtube.com/watch?v=Hm3jtqHt8tM")).toBeNull();
    expect(youtubeTarget("youtube.com/shorts/In4-6SVSDZ0")).toBeNull();
    expect(youtubeTarget("youtube.com/c/WeightWatchers")).toBeNull();
    expect(youtubeTarget("youtube.com/user/weightwatchers")).toBeNull();
    expect(youtubeTarget("ab")).toBeNull(); // handles are 3–30
    expect(youtubeTarget("not a handle!")).toBeNull();
    expect(youtubeTarget("youtube.com/channel/UCshort")).toBeNull();
  });
  it("labels and API filters", () => {
    expect(youtubeLabel("weightwatchers")).toBe("@weightwatchers");
    expect(youtubeLabel("UC7AWNWptGGpybSgZbV34yBw")).toBe("UC7AWNWptGGpybSgZbV34yBw");
    expect(channelFilter("weightwatchers")).toEqual({ forHandle: "@weightwatchers" });
    expect(channelFilter("UC7AWNWptGGpybSgZbV34yBw")).toEqual({ id: "UC7AWNWptGGpybSgZbV34yBw" });
    expect(uploadsPlaylist("UC7AWNWptGGpybSgZbV34yBw")).toBe("UU7AWNWptGGpybSgZbV34yBw");
  });
});

describe("channels.list (spike responses)", () => {
  it("a real channel: id, subscribers as a number, handle", () => {
    expect(parseChannel(channelWW)).toEqual({
      kind: "ok",
      channelId: "UC7AWNWptGGpybSgZbV34yBw",
      subscribers: 187000,
      handle: "weightwatchers",
      title: "Weight Watchers",
    });
  });
  it("a made-up handle: 200 with no items → not_found", () => {
    expect(parseChannel(channelMissing)).toMatchObject({ kind: "error", code: "not_found" });
  });
  it("hidden subscriber counts are null", () => {
    const hidden = structuredClone(channelWW);
    hidden.items[0].statistics.hiddenSubscriberCount = true;
    expect(parseChannel(hidden)).toMatchObject({ kind: "ok", subscribers: null });
  });
  it("API errors", () => {
    const err = (reason: string) => ({ error: { errors: [{ reason }] } });
    expect(youtubeErrorCode(403, err("quotaExceeded"))).toBe("quota");
    expect(youtubeErrorCode(404, err("playlistNotFound"))).toBe("not_found");
    expect(youtubeErrorCode(400, err("keyInvalid"))).toBe("youtube_unavailable");
    expect(youtubeErrorCode(500, {})).toBe("youtube_unavailable");
  });
});

describe("videos → posts", () => {
  const videos = videosWW.items;

  it("durations", () => {
    expect(isoDurationSeconds("PT40S")).toBe(40);
    expect(isoDurationSeconds("PT47M4S")).toBe(2824);
    expect(isoDurationSeconds("PT1H2M3S")).toBe(3723);
    expect(isoDurationSeconds("P0D")).toBe(0);
    expect(isoDurationSeconds("P1DT1S")).toBe(86401);
    expect(isoDurationSeconds("soon")).toBeNull();
  });

  it("Shorts: the Shorts thumbnail, else > 3 minutes = video, else ask the URL", () => {
    const decided = videos.map((v) => shortFromApi(v) ?? URL_CHECK[v.id]);
    // The spike's URL check is the truth for all 20; the API alone never disagrees with it.
    expect(decided).toEqual(videos.map((v) => URL_CHECK[v.id]));
    for (const v of videos) {
      const api = shortFromApi(v);
      if (api !== null) expect(api).toBe(URL_CHECK[v.id]);
    }
    expect(videos.filter((v) => URL_CHECK[v.id]).length).toBeGreaterThan(10);
  });

  it("only in-window videos the API can't settle get the URL check", () => {
    const cutoff = Date.parse("2026-10-25T00:00:00Z");
    const ids = videosToCheck(videos, cutoff);
    for (const id of ids) {
      const v = videos.find((x) => x.id === id)!;
      expect(Date.parse(v.snippet.publishedAt)).toBeGreaterThanOrEqual(cutoff);
      expect(shortFromApi(v)).toBeNull();
    }
    expect(videosToCheck(videos, Date.parse("2030-01-01"))).toEqual([]);
  });

  it("the URL check's answer", () => {
    expect(shortFromStatus(200)).toBe(true);
    expect(shortFromStatus(303)).toBe(false);
    expect(shortFromStatus(429)).toBeNull();
  });

  it("a Short and a long video, mapped", () => {
    const short = mapYouTubeVideo(
      videos.find((v) => v.id === "In4-6SVSDZ0"),
      true,
    )!;
    expect(short).toMatchObject({
      platform: "youtube",
      external_id: "In4-6SVSDZ0",
      url: "https://www.youtube.com/shorts/In4-6SVSDZ0",
      posted_at: "2026-11-14T06:14:47Z",
      format: "short",
      caption: "Julie Rice on what Weight Watchers is in the era of GLP-1s | The Weigh In",
      likes: 12,
      comments: 1,
      views: 1245,
      shares: null,
      duration_seconds: 40,
      counts_hidden: false,
    });
    expect(short.hashtags).toContain("julierice");
    expect(short.thumbnail_source).toMatch(/hqdefault\.jpg/);
    const long = mapYouTubeVideo(
      videos.find((v) => v.id === "Hm3jtqHt8tM"),
      false,
    )!;
    expect(long).toMatchObject({
      url: "https://www.youtube.com/watch?v=Hm3jtqHt8tM",
      format: "video",
      duration_seconds: 2824,
    });
    expect(String(long.raw.description)).toMatch(/^This week’s conversation with Julie Rice/);
    expect(postColumns(long).duration_seconds).toBe(2824);
  });

  it("unknown Shorts status shows as a Video; upcoming premieres are skipped", () => {
    const v = videos[0];
    expect(mapYouTubeVideo(v, null)!.format).toBe("video");
    const upcoming = { ...v, snippet: { ...v.snippet, liveBroadcastContent: "upcoming" } };
    expect(mapYouTubeVideo(upcoming, false)).toBeNull();
  });

  it("hidden likes", () => {
    const v = structuredClone(videos[0]) as { statistics: Record<string, unknown> };
    delete v.statistics.likeCount;
    expect(mapYouTubeVideo(v, true)).toMatchObject({ likes: null, counts_hidden: true });
  });
});

describe("a pull page", () => {
  const body = {
    channel: channelWW,
    channelId: "UC7AWNWptGGpybSgZbV34yBw",
    playlist: uploadsWW,
    videos: videosWW,
    shorts: URL_CHECK,
  };

  it("first page: posts newest first, subscribers, next cursor carries the channel", () => {
    const page = parseYouTubePage(body);
    if (page.kind !== "ok") throw new Error("expected ok");
    expect(page.creditsCost).toBe(0);
    expect(page.followers).toBe(187000);
    expect(page.posts).toHaveLength(20);
    const dates = page.posts.map((p) => p.posted_at!);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(page.posts.filter((p) => p.format === "short").length).toBe(
      shortsWW.filter((s) => s.short).length,
    );
    const next = decodeYouTubeCursor(page.nextCursor);
    expect(next?.channelId).toBe("UC7AWNWptGGpybSgZbV34yBw");
    expect(next?.pageToken).toBe(uploadsWW.nextPageToken);
  });

  it("later pages skip the channel; the window stops paging", () => {
    const page = parseYouTubePage({ ...body, channel: null });
    if (page.kind !== "ok") throw new Error("expected ok");
    expect(page.followers).toBeNull();
    // 30 days before 25 Nov: the 20 newest uploads reach back past 26 Oct → no second page.
    const cutoff = cutoffFor("2026-11-25T10:00:00Z", 30);
    const kept = postsInWindow(page.posts, cutoff);
    expect(kept.length).toBeGreaterThan(5);
    expect(kept.length).toBeLessThan(page.posts.length);
    expect(
      decideNextPage({
        posts: page.posts,
        nextCursor: page.nextCursor,
        cutoffMs: cutoff,
        pagesDone: 1,
        pageCap: 4,
        budgetLeft: 0,
        pageCost: 0,
      }),
    ).toEqual({ more: false, reason: "past_window" });
  });

  it("a channel that doesn't exist: not_found, 0 credits", () => {
    expect(parseYouTubePage({ ...body, channel: channelMissing })).toMatchObject({
      kind: "error",
      code: "not_found",
      creditsCost: 0,
    });
  });

  it("no uploads: an empty page, nothing more", () => {
    expect(parseYouTubePage({ ...body, playlist: {}, videos: { items: [] } })).toMatchObject({
      kind: "ok",
      posts: [],
      nextCursor: null,
    });
  });

  it("cursor round trip", () => {
    expect(decodeYouTubeCursor(encodeYouTubeCursor("UCabc", "TOKEN"))).toEqual({
      channelId: "UCabc",
      pageToken: "TOKEN",
    });
    expect(decodeYouTubeCursor(null)).toBeNull();
    expect(decodeYouTubeCursor("junk")).toBeNull();
  });
});

describe("30-day rule (YouTube developer policies)", () => {
  it("pulls started more than 30 days ago", () => {
    const now = Date.parse("2026-11-25T12:00:00Z");
    expect(
      youtubeExpiredPulls(
        [
          { id: "new", started_at: "2026-11-20T10:00:00Z" },
          { id: "edge", started_at: "2026-10-26T12:00:00Z" },
          { id: "old", started_at: "2026-10-20T10:00:00Z" },
        ],
        now,
      ),
    ).toEqual(["old"]);
    // 18b: a new pull whose YouTube was carried from an old pull counts from that date.
    expect(
      youtubeExpiredPulls(
        [
          {
            id: "new",
            started_at: "2026-11-24T10:00:00Z",
            carried: { youtube: "2026-10-20T10:00:00Z" },
          },
        ],
        now,
      ),
    ).toEqual(["new"]);
  });
});
