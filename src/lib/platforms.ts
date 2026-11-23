// Social platforms 30reach pulls. Mirrors supabase/functions/_shared/pull-logic.ts (kept in sync by hand).
import { InstagramIcon, LinkedInIcon, TikTokIcon } from "../components/icons/BrandIcons";

export type Platform = "instagram" | "tiktok" | "linkedin";
export const PLATFORMS: Platform[] = ["instagram", "tiktok", "linkedin"];

export const PLATFORM_NAME: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

export const PLATFORM_ICON: Record<Platform, typeof InstagramIcon> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  linkedin: LinkedInIcon,
};

/** competitors columns: where each platform is pulled from (handle, or LinkedIn company page URL). */
export const TARGET_KEY = {
  instagram: "instagram_handle",
  tiktok: "tiktok_handle",
  linkedin: "linkedin_url",
} as const satisfies Record<Platform, string>;
export const STATUS_KEY = {
  instagram: "instagram_status",
  tiktok: "tiktok_status",
  linkedin: "linkedin_status",
} as const satisfies Record<Platform, string>;

export const isPlatform = (v: unknown): v is Platform => PLATFORMS.includes(v as Platform);

/**
 * Thumbnail fallback block (no saved thumbnail) and other platform fills: Instagram Pop, TikTok Breeze,
 * LinkedIn B30 Blue (Slice 15). Blue is dark: put ink text on a surface chip on top of it, never on it.
 */
export const PLATFORM_FILL: Record<Platform, string> = {
  instagram: "bg-pop",
  tiktok: "bg-breeze",
  linkedin: "bg-blue",
};
