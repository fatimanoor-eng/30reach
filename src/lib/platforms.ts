// Social platforms 30reach pulls. Mirrors supabase/functions/_shared/pull-logic.ts (kept in sync by hand).
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  XIcon,
} from "../components/icons/BrandIcons";

export type Platform = "instagram" | "tiktok" | "linkedin" | "facebook" | "x";
export const PLATFORMS: Platform[] = ["instagram", "tiktok", "linkedin", "facebook", "x"];

export const PLATFORM_NAME: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
};

export const PLATFORM_ICON: Record<Platform, typeof InstagramIcon> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  linkedin: LinkedInIcon,
  facebook: FacebookIcon,
  x: XIcon,
};

/** competitors columns: where each platform is pulled from (handle, or LinkedIn / Facebook page URL). */
export const TARGET_KEY = {
  instagram: "instagram_handle",
  tiktok: "tiktok_handle",
  linkedin: "linkedin_url",
  facebook: "facebook_url",
  x: "x_handle",
} as const satisfies Record<Platform, string>;
export const STATUS_KEY = {
  instagram: "instagram_status",
  tiktok: "tiktok_status",
  linkedin: "linkedin_status",
  facebook: "facebook_status",
  x: "x_status",
} as const satisfies Record<Platform, string>;

export const isPlatform = (v: unknown): v is Platform => PLATFORMS.includes(v as Platform);

/** Short names for the desktop platform switch (Slice 16b): All · IG · TikTok · LinkedIn · FB · X. */
export const PLATFORM_SHORT_NAME: Record<Platform, string> = {
  instagram: "IG",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  facebook: "FB",
  x: "X",
};

/** "handle" for Instagram/TikTok/X, "page" for a LinkedIn company page or a Facebook page. */
export const targetNoun = (p: Platform) =>
  p === "linkedin" || p === "facebook" ? "page" : "handle";

/**
 * Platforms that at least one competitor has a handle / page for, in the usual order (Slice 16b: the
 * switch, sidebar and rail show only these). `null` (competitors not loaded / failed) → all of them,
 * so nothing disappears on a slow or failed load.
 */
export function platformsWithAccounts(
  competitors: readonly Partial<Record<(typeof TARGET_KEY)[Platform], string | null>>[] | null,
): Platform[] {
  if (!competitors) return PLATFORMS;
  return PLATFORMS.filter((p) => competitors.some((c) => !!c[TARGET_KEY[p]]));
}

/**
 * Thumbnail fallback block (no saved thumbnail) and other platform fills: Instagram Pop, TikTok Breeze,
 * LinkedIn B30 Blue (Slice 15), Facebook B30 Fresh (Slice 16), X ink (Slice 17g). Blue, Fresh and ink are
 * dark: put ink text on a surface chip on top of them, never on them.
 */
export const PLATFORM_FILL: Record<Platform, string> = {
  instagram: "bg-pop",
  tiktok: "bg-breeze",
  linkedin: "bg-blue",
  facebook: "bg-fresh",
  x: "bg-ink",
};

/**
 * Platforms a client tracks (Slice 17b): `client_platforms` rows that are on AND supported in 30reach.
 * Mirrors trackedPlatforms() in supabase/functions/_shared/pull-logic.ts. No rows → every platform.
 */
export function trackedPlatforms(
  rows: readonly { platform: string; state: string }[] | null | undefined,
): Platform[] {
  if (!rows || rows.length === 0) return PLATFORMS;
  const on = new Set(rows.filter((r) => r.state === "on").map((r) => r.platform));
  return PLATFORMS.filter((p) => on.has(p));
}

export type PullReadiness = "ok" | "no_competitors" | "no_accounts";

/**
 * Can this client be pulled (same rule as pull-start)? At least one competitor with a handle / page on
 * a platform the client tracks. `tracked` null (still loading) counts every platform.
 */
export function pullReadiness(
  competitors: readonly Partial<Record<(typeof TARGET_KEY)[Platform], string | null>>[],
  tracked: readonly Platform[] | null,
): PullReadiness {
  if (competitors.length === 0) return "no_competitors";
  const on = tracked ?? PLATFORMS;
  return competitors.some((c) => on.some((p) => !!c[TARGET_KEY[p]])) ? "ok" : "no_accounts";
}
