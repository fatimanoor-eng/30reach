#!/usr/bin/env node
/**
 * YouTube Data API v3 spike (25 Nov 2026), before Slice 18. 0 Firecrawl credits; ~10 quota units of the
 * project's free 10,000 a day. Results: docs/INTEGRATIONS.md → "YouTube spike" › Data API.
 *
 *   node --env-file=.env.local scripts/youtube-api-spike.mjs
 *
 * Questions: what forHandle returns for a real and a made-up handle; subscriber rounding; uploads
 * playlist order and paging; videos.list fields (views, likes, comments, duration); and whether
 * youtube.com/shorts/<id> tells a Short from a regular video (200 vs redirect).
 *
 * Safety: YOUTUBE_API_KEY comes from the environment, goes only in the `key` query parameter, and is
 * removed (redact) from everything printed or saved. Raw responses → .spike/ytapi/ (gitignored).
 * Trimmed copies for unit tests → supabase/functions/_shared/fixtures/youtube-*.json.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) {
  console.error(
    "YOUTUBE_API_KEY is not set. Run with: node --env-file=.env.local scripts/youtube-api-spike.mjs",
  );
  process.exit(1);
}
const API = "https://www.googleapis.com/youtube/v3";
const OUT = ".spike/ytapi";
const FIXTURES = "supabase/functions/_shared/fixtures";
mkdirSync(OUT, { recursive: true });

const redact = (text) => String(text).split(KEY).join("[redacted]");
const log = (...parts) =>
  console.log(
    redact(parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p, null, 2))).join(" ")),
  );
let units = 0;

async function api(name, path, params) {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key: KEY })}`;
  const started = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const json = await res.json().catch(() => ({}));
  units += 1;
  writeFileSync(
    join(OUT, `${name}.json`),
    redact(JSON.stringify({ status: res.status, json }, null, 2)),
  );
  log(`${name}: HTTP ${res.status} in ${Date.now() - started} ms`);
  if (json.error)
    log("  error:", {
      code: json.error.code,
      message: json.error.message,
      reason: json.error.errors?.[0]?.reason,
    });
  return json;
}

/** youtube.com/shorts/<id>: 200 for a Short, a redirect to /watch for a regular video (unofficial). */
async function shortsCheck(id) {
  const res = await fetch(`https://www.youtube.com/shorts/${id}`, {
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  return { id, status: res.status, location: res.headers.get("location") };
}

const channelParts = { part: "snippet,statistics,contentDetails" };

// 1. A real handle, a made-up one, and a channel id (for /channel/UC… links).
const ww = await api("channel-weightwatchers", "channels", {
  ...channelParts,
  forHandle: "@weightwatchers",
});
const c = ww.items?.[0];
log("  items:", ww.items?.length ?? 0, "| pageInfo:", ww.pageInfo);
if (c) {
  log("  id:", c.id, "| title:", c.snippet?.title, "| customUrl:", c.snippet?.customUrl);
  log("  statistics:", c.statistics);
  log("  uploads playlist:", c.contentDetails?.relatedPlaylists?.uploads);
}
const missing = await api("channel-missing", "channels", {
  ...channelParts,
  forHandle: "@zz30reachnosuchchannel7q",
});
log(
  "  made-up handle → items:",
  missing.items?.length ?? "absent",
  "| pageInfo:",
  missing.pageInfo,
);
const byId = await api("channel-by-id", "channels", {
  part: "id,statistics",
  id: "UC7AWNWptGGpybSgZbV34yBw",
});
log("  by id → items:", byId.items?.length ?? 0);
const noHandleAt = await api("channel-no-at", "channels", {
  part: "id",
  forHandle: "weightwatchers",
});
log("  forHandle without @ → items:", noHandleAt.items?.length ?? 0);

// 2. Uploads: 50 newest, then page 2.
const uploadsId = c?.contentDetails?.relatedPlaylists?.uploads;
const p1 = await api("uploads-p1", "playlistItems", {
  part: "snippet,contentDetails",
  playlistId: uploadsId,
  maxResults: "50",
});
const items = p1.items ?? [];
const dates = items.map((i) => i.contentDetails?.videoPublishedAt);
log(
  "  items:",
  items.length,
  "| nextPageToken:",
  Boolean(p1.nextPageToken),
  "| totalResults:",
  p1.pageInfo?.totalResults,
);
log("  first 5 dates:", dates.slice(0, 5), "| last:", dates.at(-1));
log(
  "  newest first:",
  dates.every((d, i) => i === 0 || dates[i - 1] >= d),
);
log(
  "  item keys:",
  Object.keys(items[0]?.snippet ?? {}),
  Object.keys(items[0]?.contentDetails ?? {}),
);
const p2 = p1.nextPageToken
  ? await api("uploads-p2", "playlistItems", {
      part: "contentDetails",
      playlistId: uploadsId,
      maxResults: "50",
      pageToken: p1.nextPageToken,
    })
  : null;
if (p2)
  log(
    "  page 2:",
    p2.items?.length,
    "| first date:",
    p2.items?.[0]?.contentDetails?.videoPublishedAt,
  );

// 3. Stats for those 50 in one call.
const ids = items.map((i) => i.contentDetails.videoId);
const vids = await api("videos", "videos", {
  part: "snippet,statistics,contentDetails,liveStreamingDetails",
  id: ids.join(","),
  maxResults: "50",
});
log("  videos returned:", vids.items?.length, "of", ids.length);
log("  statistics keys:", [
  ...new Set((vids.items ?? []).flatMap((v) => Object.keys(v.statistics ?? {}))),
]);
log(
  "  missing likeCount:",
  (vids.items ?? []).filter((v) => v.statistics?.likeCount == null).length,
);
log(
  "  missing commentCount:",
  (vids.items ?? []).filter((v) => v.statistics?.commentCount == null).length,
);
for (const v of (vids.items ?? []).slice(0, 6)) {
  log(
    `  ${v.snippet.publishedAt} | ${v.contentDetails.duration} | ${JSON.stringify(v.statistics)} | ${v.snippet.title.slice(0, 40)}`,
  );
}

// 4. Shorts: the spike's known Shorts and long videos (RSS links), then all 50 by the URL check.
const known = [
  ["In4-6SVSDZ0", "short"],
  ["53-Sk5BToAI", "short"],
  ["Zs8P7Fax7s0", "short"],
  ["Hm3jtqHt8tM", "video"],
  ["IOIGTbqEaJQ", "video"],
  ["eO4XG3-Ev44", "video"],
];
for (const [id, kind] of known) log(`  shorts check ${kind}:`, await shortsCheck(id));
const checked = [];
for (const v of vids.items ?? []) {
  const r = await shortsCheck(v.id);
  checked.push({
    id: v.id,
    duration: v.contentDetails.duration,
    short: r.status === 200,
    status: r.status,
  });
}
log("  shorts among 50:", checked.filter((x) => x.short).length, "| statuses:", [
  ...new Set(checked.map((x) => x.status)),
]);
writeFileSync(join(OUT, "shorts-check.json"), JSON.stringify(checked, null, 2));

// 5. OBU (2 uploads ever).
const obu = await api("channel-obuhealth", "channels", {
  ...channelParts,
  forHandle: "@obuhealth",
});
log("  OBU:", obu.items?.[0]?.statistics);

// Trimmed fixtures for the unit tests (public data only; no key).
const trim = (o) => JSON.parse(redact(JSON.stringify(o)));
writeFileSync(
  join(FIXTURES, "youtube-channel-weightwatchers.json"),
  JSON.stringify(trim(ww), null, 2) + "\n",
);
writeFileSync(
  join(FIXTURES, "youtube-channel-missing.json"),
  JSON.stringify(trim(missing), null, 2) + "\n",
);
writeFileSync(
  join(FIXTURES, "youtube-uploads-weightwatchers.json"),
  JSON.stringify(trim({ ...p1, items: items.slice(0, 20) }), null, 2) + "\n",
);
writeFileSync(
  join(FIXTURES, "youtube-videos-weightwatchers.json"),
  JSON.stringify(trim({ ...vids, items: (vids.items ?? []).slice(0, 20) }), null, 2) + "\n",
);
log(`Done. Quota used: ~${units} units. Firecrawl credits: 0.`);
