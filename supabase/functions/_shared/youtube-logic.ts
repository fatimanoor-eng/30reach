// YouTube (Slice 18): pure logic for the YouTube Data API v3 (no Deno APIs). The I/O is in server.ts
// (fetchYouTubePage, checkYouTubeChannel). Tested with the 25 Nov spike's real responses (./fixtures/youtube-*).
// See docs/INTEGRATIONS.md › "YouTube spike" › Data API.
//
// A pull page = 1 `channels.list` (first page only: subscribers, "not found") + 1 `playlistItems.list` (the
// channel's uploads, 50 newest first) + 1 `videos.list` (views, likes, comments, duration). 0 Firecrawl
// credits; ~3 quota units of the project's free 10,000 a day. Shorts: a 1080×1920 `shortsAspectRatio`
// thumbnail, or else youtube.com/shorts/<id> answering 200 (a regular video redirects to /watch).

import { extractHashtags, type MappedPost, type PageResult } from "./pull-logic.ts";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
/** The API sends counts as strings ("187000"). */
const count = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** YouTube's own @handle rules: 3–30 letters, digits, "_", "-", "." (stored lowercase, no "@"). */
export const YOUTUBE_HANDLE = /^[a-z0-9._-]{3,30}$/;
/** A channel id: "UC" + 22 characters (kept as typed: ids are case-sensitive). */
export const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
export const isChannelId = (v: string) => YOUTUBE_CHANNEL_ID.test(v);

/**
 * What a person types → what we store in competitors.youtube_handle: the handle ("weightwatchers") or a
 * channel id ("UC…") from a /channel/ link. "@WeightWatchers", "youtube.com/@weightwatchers/shorts",
 * "m.youtube.com/channel/UC…" all work. Old /c/ and /user/ links and video links don't name a channel
 * reliably → null (the field asks for the @handle).
 */
export function youtubeTarget(input: string): string | null {
  let v = input.trim();
  const link = v.match(/^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/([^?#]+)/i);
  if (link) {
    const [first, second] = link[1].split("/");
    if (first === "channel") return second && isChannelId(second) ? second : null;
    if (!first.startsWith("@")) return null; // /c/…, /user/…, /watch, /shorts/<id>…
    v = first;
  }
  if (isChannelId(v)) return v;
  v = v.replace(/^@/, "").toLowerCase();
  return YOUTUBE_HANDLE.test(v) ? v : null;
}

/** "weightwatchers" → "@weightwatchers"; a channel id stays as it is. */
export const youtubeLabel = (target: string) => (isChannelId(target) ? target : `@${target}`);

/** channels.list filter for a stored target. */
export const channelFilter = (target: string): Record<string, string> =>
  isChannelId(target) ? { id: target } : { forHandle: `@${target}` };

/** A channel's uploads playlist: "UC…" → "UU…" (spike: UC7AWN… → UU7AWN…). */
export const uploadsPlaylist = (channelId: string) => `UU${channelId.slice(2)}`;

export type ChannelResult =
  | {
      kind: "ok";
      channelId: string;
      subscribers: number | null;
      handle: string | null;
      title: string | null;
    }
  | { kind: "error"; code: string; message: string };

/**
 * channels.list → the channel, or not_found. A made-up handle answers HTTP 200 with no `items` and
 * `pageInfo.totalResults: 0` (spike). Hidden subscriber counts come back as null.
 */
export function parseChannel(body: unknown): ChannelResult {
  const item = obj((obj(body).items as unknown[] | undefined)?.[0]);
  const id = str(item.id);
  if (!id) return { kind: "error", code: "not_found", message: "Channel not found" };
  const stats = obj(item.statistics);
  const snippet = obj(item.snippet);
  return {
    kind: "ok",
    channelId: id,
    subscribers: stats.hiddenSubscriberCount === true ? null : count(stats.subscriberCount),
    handle: str(snippet.customUrl)?.replace(/^@/, "").toLowerCase() ?? null,
    title: str(snippet.title),
  };
}

/** An API error body → our code. Quota used up for today → "quota" (resets at midnight Pacific). */
export function youtubeErrorCode(status: number, body: unknown): string {
  const e = obj(obj(body).error);
  const reason = str(obj((e.errors as unknown[] | undefined)?.[0]).reason) ?? "";
  if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(reason)) return "quota";
  if (status === 404 || reason === "playlistNotFound" || reason === "channelNotFound")
    return "not_found";
  return "youtube_unavailable";
}

/** "PT1H2M3S" → 3723; "P0D" (a live stream) → 0; nonsense → null. */
export function isoDurationSeconds(v: unknown): number | null {
  const m =
    typeof v === "string" ? v.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/) : null;
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** Shorts are at most 3 minutes, so a longer upload never needs the Shorts URL check. */
export const SHORTS_MAX_SECONDS = 180;

/**
 * Is this video a Short, as far as the API can tell? true = yes (it has the 1080×1920 Shorts thumbnail),
 * false = no (longer than 3 minutes, or upcoming / live), null = ask youtube.com/shorts/<id>.
 */
export function shortFromApi(video: unknown): boolean | null {
  const v = obj(video);
  const snippet = obj(v.snippet);
  if ("shortsAspectRatio" in obj(snippet.thumbnails)) return true;
  if (snippet.liveBroadcastContent === "live" || snippet.liveBroadcastContent === "upcoming")
    return false;
  const seconds = isoDurationSeconds(obj(v.contentDetails).duration);
  return seconds !== null && seconds > SHORTS_MAX_SECONDS ? false : null;
}

/** The videos that still need the Shorts URL check: in the window and not settled by the API. */
export function videosToCheck(videos: readonly unknown[], cutoffMs: number): string[] {
  return videos
    .filter((v) => {
      const at = Date.parse(str(obj(obj(v).snippet).publishedAt) ?? "");
      return Number.isFinite(at) && at >= cutoffMs && shortFromApi(v) === null;
    })
    .map((v) => str(obj(v).id))
    .filter((id): id is string => id !== null);
}

/** The URL check's answer: 200 = a Short; a redirect (303 to /watch) = a regular video; else unknown. */
export const shortFromStatus = (status: number): boolean | null =>
  status === 200 ? true : status >= 300 && status < 400 ? false : null;

/** Largest thumbnail that stays small: high (480×360) → medium (320×180) → default. */
function thumbnail(snippet: Obj): string | null {
  const t = obj(snippet.thumbnails);
  return str(obj(t.high).url) ?? str(obj(t.medium).url) ?? str(obj(t.default).url);
}

/**
 * One videos.list item → a post. The title is the post's text (what the cards and Blip read); the
 * description's first 1,000 characters go in `raw`. Upcoming premieres/streams are skipped (no date yet).
 * `short` = the Shorts decision (null when the check couldn't tell: shown as a Video).
 */
export function mapYouTubeVideo(video: unknown, short: boolean | null): MappedPost | null {
  const v = obj(video);
  const id = str(v.id);
  const snippet = obj(v.snippet);
  if (!id || snippet.liveBroadcastContent === "upcoming") return null;
  const stats = obj(v.statistics);
  const title = str(snippet.title);
  const description = typeof snippet.description === "string" ? snippet.description : "";
  const isShort = short === true;
  return {
    platform: "youtube",
    external_id: id,
    url: isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
    posted_at: str(snippet.publishedAt),
    posted_by: str(snippet.channelTitle),
    format: isShort ? "short" : "video",
    caption: title,
    hashtags: extractHashtags(`${title ?? ""} ${description}`),
    likes: count(stats.likeCount),
    comments: count(stats.commentCount),
    views: count(stats.viewCount),
    shares: null,
    saves: null,
    // Likes can be hidden by the channel: the API then leaves likeCount out.
    counts_hidden: stats.likeCount === undefined,
    is_paid: false,
    is_collab: false,
    duration_seconds: isoDurationSeconds(obj(v.contentDetails).duration),
    raw: {
      description: description.slice(0, 1000) || null,
      live: snippet.liveBroadcastContent === "live" || undefined,
      category: str(snippet.categoryId),
    },
    thumbnail_source: thumbnail(snippet),
    pinned: false,
  };
}

/** The cursor between pages: the channel id (so later pages skip channels.list) + the API's page token. */
export const encodeYouTubeCursor = (channelId: string, pageToken: string) =>
  `${channelId}|${pageToken}`;
export function decodeYouTubeCursor(cursor: string | null) {
  if (!cursor) return null;
  const [channelId, pageToken] = cursor.split("|");
  return channelId && pageToken ? { channelId, pageToken } : null;
}

/** What server.ts fetched for one page (raw API bodies + the Shorts URL checks). */
export type YouTubePageBody = {
  channel: unknown | null; // first page only
  channelId: string;
  playlist: unknown;
  videos: unknown;
  /** video id → the URL check's answer (only for videos the API couldn't settle). */
  shorts: Record<string, boolean | null>;
};

/** One fetched page → posts, the next cursor and (first page) the subscriber count. 0 credits. */
export function parseYouTubePage(body: YouTubePageBody): PageResult {
  let followers: number | null = null;
  if (body.channel !== null) {
    const ch = parseChannel(body.channel);
    if (ch.kind === "error") return { ...ch, creditsCost: 0 };
    followers = ch.subscribers;
  }
  const list = (obj(body.videos).items as unknown[] | undefined) ?? [];
  const posts = list
    .map((v) => {
      const id = str(obj(v).id) ?? "";
      return mapYouTubeVideo(v, shortFromApi(v) ?? body.shorts[id] ?? null);
    })
    .filter((p): p is MappedPost => p !== null)
    // videos.list doesn't promise the ids' order: newest first, like the uploads playlist.
    .sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
  const token = str(obj(body.playlist).nextPageToken);
  return {
    kind: "ok",
    posts,
    nextCursor: token && list.length ? encodeYouTubeCursor(body.channelId, token) : null,
    creditsCost: 0,
    followers,
  };
}

/**
 * YouTube's developer policies: API statistics may be stored for at most 30 days without a refresh. "Keep
 * the last 2 pulls" can keep a pull longer, so after every pull its YouTube posts in pulls older than 30
 * days are deleted (the pages also stop showing them, in case nobody pulls).
 */
export const YOUTUBE_KEEP_DAYS = 30;
export function youtubeExpiredPulls(
  pulls: readonly { id: string; started_at: string; carried?: { youtube?: string } | null }[],
  nowMs: number,
): string[] {
  const limit = nowMs - YOUTUBE_KEEP_DAYS * 24 * 60 * 60 * 1000;
  // A pull's YouTube data may be carried from an older pull (18b): its own date counts.
  return pulls
    .filter((p) => Date.parse(p.carried?.youtube ?? p.started_at) < limit)
    .map((p) => p.id);
}
