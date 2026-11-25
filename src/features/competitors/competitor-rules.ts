// Competitors (Slice 8: 07 / 07b / 07c; LinkedIn Slice 15a; Facebook Slice 16a; YouTube Slice 18). Pure rules, tested in
// competitor-rules.test.ts.
import {
  type Platform,
  PLATFORM_NAME,
  PLATFORMS,
  STATUS_KEY,
  TARGET_KEY,
} from "../../lib/platforms";
import { formatCompact, formatShortDate } from "../../lib/format";
import type { Competitor } from "../../lib/useCompetitors";
import { targetNoun } from "../pulls/pull-text";

export { targetNoun };

export { PLATFORM_NAME, PLATFORMS };
/**
 * Most a check can cost for a handle / page that exists; not found = 0. Instagram / TikTok: a first page
 * of posts (2); LinkedIn: 1–2; Facebook: AnyAPI's page profile with the followers (5, spike 24 Nov);
 * X: ScrapeCreators x/user-posts (1, also when the account doesn't exist; Slice 17g). YouTube: the
 * official YouTube Data API, free (Slice 18). Same numbers as check-handle (CHECK_COST there).
 */
export const CHECK_COST: Record<Platform, number> = {
  instagram: 2,
  tiktok: 2,
  linkedin: 2,
  facebook: 5,
  x: 1,
  youtube: 0,
};

// ───────────────────────────────────────────── initials
/**
 * Suggested avatar initials (editable). Two words → first letters ("Weight Watchers" → "WW");
 * CamelCase → its capitals ("WeightWatchers" → "WW", "LifeMD" → "LM"); else the first two letters
 * ("Hims" → "Hi", "Ro" → "Ro").
 */
export function suggestInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0];
  const caps = w.match(/[A-Z]/g) ?? [];
  if (caps.length >= 2 && /^[A-Z]/.test(w)) return caps[0] + caps[1];
  return w[0].toUpperCase() + (w[1] ?? "").toLowerCase();
}
export const MAX_INITIALS = 3;

// ───────────────────────────────────────────── handles
const PATTERN: Record<"instagram" | "tiktok" | "x", RegExp> = {
  instagram: /^[a-z0-9._]{1,30}$/,
  tiktok: /^[a-z0-9._]{2,24}$/,
  // Same rule as xHandle() in supabase/functions/_shared/pull-logic.ts.
  x: /^[a-z0-9_]{1,15}$/,
};
/** x.com pages that aren't accounts. */
const X_RESERVED = ["home", "search", "intent", "share", "i"];

// ───────────────────────────────────────────── LinkedIn company page
// Same rule as supabase/functions/_shared/pull-logic.ts (linkedInSlug); kept in sync by hand.
const LINKEDIN_SLUG = /^[a-z0-9][a-z0-9&._-]{1,99}$/;

/** Company page → slug, or null. Accepts a full URL, "linkedin.com/company/x", "company/x" or the slug. */
export function linkedInSlug(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  const link = v.match(
    /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/company\/([^/?#]+)|^company\/([^/?#]+)/i,
  );
  if (link) v = link[1] ?? link[2];
  else if (/[/:]/.test(v)) return null; // a personal /in/ profile or another site
  try {
    v = decodeURIComponent(v);
  } catch {
    return null;
  }
  v = v.toLowerCase();
  return LINKEDIN_SLUG.test(v) ? v : null;
}
export const linkedInUrl = (slug: string) => `https://www.linkedin.com/company/${slug}/`;
/** Stored URL → what the field and the table show: "linkedin.com/company/hims-&-hers". */
export const linkedInDisplay = (url: string) =>
  url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

// ───────────────────────────────────────────── Facebook page
// Same rule as supabase/functions/_shared/pull-logic.ts (facebookPageUrl); kept in sync by hand.
/** First path parts that are never a page: groups, events, single posts, personal profiles, Facebook's own. */
const FACEBOOK_NOT_A_PAGE = new Set([
  "groups",
  "events",
  "watch",
  "reel",
  "reels",
  "videos",
  "photo",
  "photo.php",
  "photos",
  "posts",
  "permalink.php",
  "story.php",
  "share",
  "sharer",
  "sharer.php",
  "people",
  "pages",
  "marketplace",
  "gaming",
  "hashtag",
  "login",
  "help",
  "policies",
  "settings",
  "home.php",
  "search",
  "stories",
]);
const FACEBOOK_SLUG = /^[a-z0-9][a-z0-9.-]{1,99}$/;

/**
 * Page link or username → canonical https://www.facebook.com/<slug> (or …/profile.php?id=<id>), or null.
 * Accepts "facebook.com/weightwatchers/", "m.facebook.com/x/posts", "fb.com/x", "@x" or "x".
 */
export function facebookPageUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const link = v.match(
    /^(?:https?:\/\/)?(?:(?:www|m|web|mobile|business)\.)?(?:facebook\.com|fb\.com)(\/[^?#]*)?(\?[^#]*)?/i,
  );
  let slug: string;
  if (link) {
    const parts = (link[1] ?? "").split("/").filter(Boolean);
    if (parts.length === 0) return null;
    const first = parts[0].toLowerCase();
    if (first === "profile.php") {
      const id = new URLSearchParams(link[2] ?? "").get("id");
      return id && /^\d{5,25}$/.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : null;
    }
    // Newer page links: facebook.com/p/<Name>-<id>/ → the same page by id (17a; both forms returned the
    // same posts in a test, 1 credit each). The id is stable when the page is renamed.
    if (first === "p") {
      const id = parts[1]?.match(/-(\d{5,25})$/)?.[1];
      return id ? `https://www.facebook.com/profile.php?id=${id}` : null;
    }
    if (FACEBOOK_NOT_A_PAGE.has(first)) return null;
    slug = parts[0];
  } else {
    if (/[/:?#\s]/.test(v)) return null; // some other link or text
    slug = v.replace(/^@/, "");
  }
  try {
    slug = decodeURIComponent(slug).toLowerCase();
  } catch {
    return null;
  }
  return FACEBOOK_SLUG.test(slug) && !FACEBOOK_NOT_A_PAGE.has(slug)
    ? `https://www.facebook.com/${slug}`
    : null;
}
/** Stored URL → what the field and the table show: "facebook.com/weightwatchers". */
export const facebookDisplay = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

// ───────────────────────────────────────────── YouTube channel (Slice 18)
// Same rules as supabase/functions/_shared/youtube-logic.ts (youtubeTarget); kept in sync by hand.
const YOUTUBE_HANDLE = /^[a-z0-9._-]{3,30}$/;
const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
export const isYouTubeChannelId = (v: string) => YOUTUBE_CHANNEL_ID.test(v);

/**
 * @handle, handle or channel link → the handle (lowercase, no "@") or a channel id (UC…, case kept), or
 * null. Old /c/ and /user/ links and video links don't name a channel reliably.
 */
export function youtubeTarget(input: string): string | null {
  let v = input.trim();
  const link = v.match(/^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/([^?#]+)/i);
  if (link) {
    const [first, second] = link[1].split("/");
    if (first === "channel") return second && isYouTubeChannelId(second) ? second : null;
    if (!first.startsWith("@")) return null;
    v = first;
  }
  if (isYouTubeChannelId(v)) return v;
  v = v.replace(/^@/, "").toLowerCase();
  return YOUTUBE_HANDLE.test(v) ? v : null;
}

/** Page URL (LinkedIn / Facebook) or handle → what the field, the table and the cards show. */
export function targetDisplay(platform: Platform, value: string): string {
  if (platform === "linkedin") return linkedInDisplay(value);
  if (platform === "facebook") return facebookDisplay(value);
  return value;
}

/** A saved account as people read it: "@noom", "linkedin.com/company/…", a YouTube channel id as it is. */
export function handleLabel(platform: Platform, value: string): string {
  if (platform === "linkedin" || platform === "facebook") return targetDisplay(platform, value);
  if (platform === "youtube" && isYouTubeChannelId(value)) return value;
  return `@${value}`;
}

export type HandleInput =
  { kind: "empty" } | { kind: "ok"; handle: string } | { kind: "invalid"; message: string };

/**
 * What someone typed → what's stored. Instagram/TikTok/X: the handle (lowercase, no "@"); accepts "@noom",
 * "noom" or a profile link ("instagram.com/noom/", "https://www.tiktok.com/@noom?lang=en"). LinkedIn:
 * the canonical company page URL; accepts a page link or its slug. Facebook: the canonical page URL;
 * accepts a page link or its username. Invalid input never costs credits.
 */
export function parseHandle(platform: Platform, input: string): HandleInput {
  let v = input.trim();
  if (!v) return { kind: "empty" };
  if (platform === "linkedin") {
    const slug = linkedInSlug(v);
    return slug
      ? { kind: "ok", handle: linkedInUrl(slug) }
      : { kind: "invalid", message: "Use a company page link (linkedin.com/company/…)." };
  }
  if (platform === "facebook") {
    const url = facebookPageUrl(v);
    return url
      ? { kind: "ok", handle: url }
      : { kind: "invalid", message: "Use a Facebook page link (facebook.com/…)." };
  }
  if (platform === "youtube") {
    const t = youtubeTarget(v);
    return t
      ? { kind: "ok", handle: t }
      : {
          kind: "invalid",
          message: "Use the channel’s @handle (youtube.com/@…) or a youtube.com/channel/… link.",
        };
  }
  const host =
    platform === "instagram"
      ? "instagram\\.com"
      : platform === "x"
        ? "(?:x|twitter)\\.com"
        : "tiktok\\.com";
  const link = v.match(
    new RegExp(`^(?:https?://)?(?:www\\.|m\\.|mobile\\.)?${host}/@?([^/?#]+)`, "i"),
  );
  if (link) v = link[1];
  v = v.replace(/^@/, "").toLowerCase();
  const pattern = PATTERN[platform as "instagram" | "tiktok" | "x"];
  if (pattern.test(v) && !(platform === "x" && X_RESERVED.includes(v)))
    return { kind: "ok", handle: v };
  return {
    kind: "invalid",
    message:
      platform === "instagram"
        ? "Use letters, numbers, dots or underscores (up to 30)."
        : platform === "x"
          ? "Use letters, numbers or underscores (up to 15)."
          : "Use 2–24 letters, numbers, dots or underscores.",
  };
}

export type HandleField = { handle: string | null; status: Competitor["instagram_status"] };

/** Platforms whose handle is new or changed and not empty → these get checked on Save. */
export function handlesToCheck(
  before: Partial<Record<Platform, string | null>>,
  after: Record<Platform, string | null>,
): Platform[] {
  return PLATFORMS.filter((p) => after[p] !== null && after[p] !== (before[p] ?? null));
}

/** Another competitor already uses this handle / page on this platform? (case-insensitive) */
export function duplicateOf(
  competitors: Competitor[],
  platform: Platform,
  handle: string,
  exceptId?: string,
): Competitor | null {
  const key = TARGET_KEY[platform];
  return (
    competitors.find((c) => c.id !== exceptId && c[key]?.toLowerCase() === handle.toLowerCase()) ??
    null
  );
}

// ───────────────────────────────────────────── status chip (07)
export type StatusTone = "ok" | "danger" | "neutral";

/**
 * OK · "TikTok not found" / "LinkedIn not found" / "Not found" (2 or more) · "Not checked".
 * Platforms without a handle / page are ignored.
 */
export function competitorStatus(c: Competitor): { label: string; tone: StatusTone } {
  const present = PLATFORMS.filter((p) => !!c[TARGET_KEY[p]]);
  const status = (p: Platform) => c[STATUS_KEY[p]];
  const missing = present.filter((p) => status(p) === "not_found");
  if (missing.length >= 2) return { label: "Not found", tone: "danger" };
  if (missing.length === 1)
    return { label: `${PLATFORM_NAME[missing[0]]} not found`, tone: "danger" };
  if (present.length === 0 || present.some((p) => status(p) === "unchecked"))
    return { label: "Not checked", tone: "neutral" };
  return { label: "OK", tone: "ok" };
}

// ───────────────────────────────────────────── 07b copy
/**
 * Green message under a field that was found. Facebook adds the followers the check read, and "as of
 * {date}" once saved (the count isn't refreshed by pulls): "Found · public page · 2.9M followers as of 24 Nov".
 */
export function foundMessage(
  platform: Platform,
  followers?: number | null,
  asOf?: string | null,
  now: Date = new Date(),
): string {
  if (platform === "linkedin") return "Found · public company page";
  // YouTube (18): subscribers come with the check and are refreshed by every pull.
  if (platform === "youtube")
    return followers === null || followers === undefined
      ? "Found · public channel"
      : `Found · public channel · ${formatCompact(followers)} subscribers`;
  if (platform !== "facebook") return "Found · public account";
  if (followers === null || followers === undefined) return "Found · public page";
  const date = asOf ? formatShortDate(asOf, now) : null;
  return `Found · public page · ${formatCompact(followers)} followers${date ? ` as of ${date}` : ""}`;
}

/**
 * Cost line above Save (07b). Instagram / TikTok / LinkedIn checks cost up to 2 each; Facebook up to 5
 * (it also reads the followers); X 1. "Checking costs up to 5 credits" when only a Facebook page is checked.
 */
export function checkCostNote(toCheck: Platform[]): string {
  if (toCheck.length === 0) return "No handle to check · no credits";
  // YouTube (18): checked with YouTube's own free API, never Firecrawl credits.
  if (toCheck.includes("youtube")) {
    const rest = toCheck.filter((p) => p !== "youtube");
    return rest.length
      ? `${checkCostNote(rest)} · YouTube is free`
      : "Checking YouTube is free · no credits";
  }
  const total = toCheck.reduce((n, p) => n + CHECK_COST[p], 0);
  // X (17g): always 1 credit, also when the account doesn't exist.
  const xs = toCheck.filter((p) => p === "x").length;
  if (xs && xs === toCheck.length)
    return xs === 1 ? "Checking costs 1 credit" : `Checking costs ${total} credits`;
  if (xs) return `Checking costs up to ${total} credits (1 for X)`;
  const others = toCheck.filter((p) => p !== "facebook");
  if (others.length === 0) return `Checking costs up to ${total} credits`;
  if (others.length === toCheck.length)
    return `Checking costs ${CHECK_COST.instagram} credits per handle · up to ${total} now`;
  return `Checking costs ${CHECK_COST.instagram} per handle, ${CHECK_COST.facebook} for Facebook · up to ${total} now`;
}
