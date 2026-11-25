// Carry-over (Slice 18b): a Refresh pulls only the platforms ticked in the dialog; when it finishes, every
// other platform the client tracks is copied from the previous pull into the new one (posts, followers,
// thumbnails; no credits), so no platform goes blank. `pulls.carried` records where each carried platform's
// data really comes from: { "tiktok": "<the original pull's started_at>" } (a chain of carries keeps the
// first date). Pure logic, tested in carry-logic.test.ts; pull-finish does the copying.

import type { Platform } from "./pull-logic.ts";
import { YOUTUBE_KEEP_DAYS } from "./youtube-logic.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export type Carried = Partial<Record<Platform, string>>;
export type CarryStep = { platform: Platform; from: string };

/**
 * Which platforms to copy from `previous` into the pull that just finished:
 * - the client tracks it,
 * - this pull didn't get it (not ticked, or every task failed, e.g. YouTube's daily limit),
 * - the previous pull has data for it.
 * YouTube data older than 30 days is never carried (YouTube's API policies; pulling YouTube is free).
 */
export function carryPlan(o: {
  tracked: readonly Platform[];
  tasks: readonly { platform: string; status: string }[];
  previous: { started_at: string; carried?: Carried | null } | null;
  previousPlatforms: readonly string[];
  nowMs: number;
}): CarryStep[] {
  if (!o.previous) return [];
  const pulled = new Set(o.tasks.filter((t) => t.status === "done").map((t) => t.platform));
  const has = new Set(o.previousPlatforms);
  const out: CarryStep[] = [];
  for (const platform of o.tracked) {
    if (pulled.has(platform) || !has.has(platform)) continue;
    const from = o.previous.carried?.[platform] ?? o.previous.started_at;
    if (platform === "youtube" && o.nowMs - Date.parse(from) > YOUTUBE_KEEP_DAYS * DAY_MS) continue;
    out.push({ platform, from });
  }
  return out;
}

/** A post row copied into the new pull: same data, new pull, no thumbnail yet (copied after). */
export function carriedPostRow<T extends Record<string, unknown>>(row: T, newPullId: string) {
  const copy: Record<string, unknown> = { ...row, pull_id: newPullId, thumbnail_path: null };
  delete copy.id;
  delete copy.created_at;
  return copy;
}

/**
 * The previous pull's tasks for carried platforms → rows for the new pull: `done`, error_code "carried"
 * (so estimates and problem lists skip them), 0 credits and pages, same followers and post counts.
 */
export function carriedTaskRow(
  t: {
    competitor_id: string;
    platform: string;
    followers: number | null;
    posts_found: number | null;
  },
  newPullId: string,
  finishedAt: string,
) {
  return {
    pull_id: newPullId,
    competitor_id: t.competitor_id,
    platform: t.platform,
    status: "done",
    error_code: "carried",
    credits_used: 0,
    pages: 0,
    posts_found: t.posts_found ?? 0,
    followers: t.followers,
    finished_at: finishedAt,
  };
}

/** A stored thumbnail's path in the new pull: same file type, new pull and post ids. */
export function carriedThumbPath(
  oldPath: string,
  clientId: string,
  pullId: string,
  postId: string,
) {
  const ext = oldPath.match(/\.(jpg|jpeg|png|webp)$/i)?.[1]?.toLowerCase() ?? "jpg";
  return `${clientId}/${pullId}/${postId}.${ext === "jpeg" ? "jpg" : ext}`;
}

/**
 * Where to read each brand × platform's last real cost for the estimate: the newest pull that actually
 * pulled it (a carried task costs 0 and says nothing about the next pull's cost).
 */
export function lastRealCredits(
  pulls: readonly {
    tasks: readonly {
      competitor_id: string;
      platform: string;
      credits_used: number | null;
      error_code: string | null;
    }[];
  }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of pulls) {
    for (const t of p.tasks) {
      const key = `${t.competitor_id}:${t.platform}`;
      if (t.error_code === "carried" || out.has(key)) continue;
      out.set(key, t.credits_used ?? 0);
    }
  }
  return out;
}

/**
 * Start of today in Pacific time (YouTube's daily quota resets at midnight Pacific), as UTC ms.
 */
export function pacificDayStart(nowMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offset = wallAsUtc - Math.floor(nowMs / 1000) * 1000; // Pacific − UTC (negative)
  return Date.UTC(get("year"), get("month") - 1, get("day")) - offset;
}
