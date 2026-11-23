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
 * Platforms the dashboards (Overview, Social pages) and Blip already show. A pull can save LinkedIn
 * posts from Slice 15a on; they stay out of these screens until 15b (pages) and 15c (Blip) add them.
 */
export type ShownPlatform = Exclude<Platform, "linkedin">;
export const SHOWN_PLATFORMS: ShownPlatform[] = ["instagram", "tiktok"];
