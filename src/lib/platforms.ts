// Social platforms 30reach pulls. Mirrors supabase/functions/_shared/pull-logic.ts (kept in sync by hand).
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
} from "../components/icons/BrandIcons";

export type Platform = "instagram" | "tiktok" | "linkedin" | "facebook";
export const PLATFORMS: Platform[] = ["instagram", "tiktok", "linkedin", "facebook"];

export const PLATFORM_NAME: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};

export const PLATFORM_ICON: Record<Platform, typeof InstagramIcon> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  linkedin: LinkedInIcon,
  facebook: FacebookIcon,
};

/** competitors columns: where each platform is pulled from (handle, or LinkedIn / Facebook page URL). */
export const TARGET_KEY = {
  instagram: "instagram_handle",
  tiktok: "tiktok_handle",
  linkedin: "linkedin_url",
  facebook: "facebook_url",
} as const satisfies Record<Platform, string>;
export const STATUS_KEY = {
  instagram: "instagram_status",
  tiktok: "tiktok_status",
  linkedin: "linkedin_status",
  facebook: "facebook_status",
} as const satisfies Record<Platform, string>;

export const isPlatform = (v: unknown): v is Platform => PLATFORMS.includes(v as Platform);

/**
 * Thumbnail fallback block (no saved thumbnail) and other platform fills: Instagram Pop, TikTok Breeze,
 * LinkedIn B30 Blue (Slice 15), Facebook B30 Fresh (Slice 16). Blue and Fresh are dark: put ink text on a
 * surface chip on top of them, never on them.
 */
export const PLATFORM_FILL: Record<Platform, string> = {
  instagram: "bg-pop",
  tiktok: "bg-breeze",
  linkedin: "bg-blue",
  facebook: "bg-fresh",
};

/**
 * Platforms the dashboards (Overview, Social pages), calendar, ideas and Blip already show. A pull can
 * save Facebook posts from Slice 16a on; they stay out of these screens until 16b (pages) and 16c
 * (calendar, ideas, Blip) add them.
 */
export type ShownPlatform = Exclude<Platform, "facebook">;
export const SHOWN_PLATFORMS: ShownPlatform[] = ["instagram", "tiktok", "linkedin"];
export const isShownPlatform = (v: unknown): v is ShownPlatform =>
  SHOWN_PLATFORMS.includes(v as ShownPlatform);
