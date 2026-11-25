// Pure rules for the `check-handle` Edge Function (Slice 8, INTEGRATIONS.md §2c). Tested in logic.test.ts.
import {
  facebookPageUrl,
  linkedInSlug,
  linkedInUrl,
  type PageResult,
  type Platform,
  PLATFORMS,
  type ProfileResult,
  xHandle,
} from "../_shared/pull-logic.ts";
import { type ChannelResult, youtubeTarget } from "../_shared/youtube-logic.ts";

/** Handles are stored lowercase without "@". Instagram 1–30 chars, TikTok 2–24; letters, digits, . and _. */
export const HANDLE_PATTERN: Record<"instagram" | "tiktok", RegExp> = {
  instagram: /^[a-z0-9._]{1,30}$/,
  tiktok: /^[a-z0-9._]{2,24}$/,
};

/**
 * Most a check can cost; refuse if the balance can't cover it. Instagram / TikTok / LinkedIn: one first
 * page of posts (2). Facebook: AnyAPI facebook/profile for the followers (5; 0 if the page doesn't exist).
 */
export const CHECK_COST: Record<Platform, number> = {
  instagram: 2,
  tiktok: 2,
  linkedin: 2,
  facebook: 5,
  x: 1, // ScrapeCreators x/user-posts (17g): 1, also when the account doesn't exist
  youtube: 0, // YouTube Data API (18): free; 1 quota unit
};

/** `handle` = the Instagram/TikTok handle, or the LinkedIn / Facebook page URL (canonical). */
export type CheckRequest = { platform: Platform; handle: string };

/**
 * Body → request, or the error code to return (400). The browser already normalises; this re-checks,
 * so a malformed handle or page never reaches Firecrawl. LinkedIn accepts a company page URL or slug
 * and is normalised to https://www.linkedin.com/company/<slug>/; Facebook accepts a page link or
 * username and is normalised to https://www.facebook.com/<slug> (facebookPageUrl).
 */
export function parseCheckRequest(body: Record<string, unknown>): CheckRequest | { error: string } {
  const platform = body.platform as Platform;
  if (!PLATFORMS.includes(platform)) return { error: "bad_platform" };
  const input = typeof body.handle === "string" ? body.handle : "";
  if (platform === "linkedin") {
    const slug = linkedInSlug(input);
    return slug ? { platform, handle: linkedInUrl(slug) } : { error: "bad_handle" };
  }
  if (platform === "facebook") {
    const url = facebookPageUrl(input);
    return url ? { platform, handle: url } : { error: "bad_handle" };
  }
  if (platform === "x") {
    const h = xHandle(input);
    return h ? { platform, handle: h } : { error: "bad_handle" };
  }
  if (platform === "youtube") {
    const t = youtubeTarget(input);
    return t ? { platform, handle: t } : { error: "bad_handle" };
  }
  const raw = input.trim().replace(/^@/, "").toLowerCase();
  if (!HANDLE_PATTERN[platform as "instagram" | "tiktok"].test(raw)) return { error: "bad_handle" };
  return { platform, handle: raw };
}

export type CheckOutcome =
  | { status: "ok"; creditsUsed: number; followers: number | null }
  | { status: "not_found"; creditsUsed: number }
  | { error: string; creditsUsed: number };

/**
 * One parsed first page → outcome. Provider "not_found" = the handle doesn't exist (0 credits in the
 * spikes; parsePage already maps LinkedIn's invalid_option to not_found); any page of posts (even
 * empty) = the account exists and is readable. Other provider errors are passed on so the panel can
 * say "couldn't check, try again" instead of marking the handle wrong.
 */
export function checkOutcome(page: PageResult): CheckOutcome {
  if (page.kind === "ok")
    return { status: "ok", creditsUsed: page.creditsCost, followers: page.followers };
  if (page.code === "not_found") return { status: "not_found", creditsUsed: page.creditsCost };
  return { error: page.code, creditsUsed: page.creditsCost };
}

/**
 * Facebook: the AnyAPI profile → outcome. `found: false` = the page doesn't exist or isn't public
 * (0 credits); found = ok with the follower count, which the browser saves with today's date.
 */
export function profileOutcome(profile: ProfileResult): CheckOutcome {
  if (profile.kind === "ok")
    return { status: "ok", creditsUsed: profile.creditsCost, followers: profile.followers };
  if (profile.code === "not_found")
    return { status: "not_found", creditsUsed: profile.creditsCost };
  return { error: profile.code, creditsUsed: profile.creditsCost };
}

/** YouTube (18): channels.list → outcome, plus the channel id the browser saves (pulls skip the lookup). */
export function channelOutcome(
  ch: ChannelResult,
): (CheckOutcome & { channelId?: string }) | { error: string; creditsUsed: number } {
  if (ch.kind === "ok")
    return { status: "ok", creditsUsed: 0, followers: ch.subscribers, channelId: ch.channelId };
  if (ch.code === "not_found") return { status: "not_found", creditsUsed: 0 };
  return { error: ch.code, creditsUsed: 0 };
}
