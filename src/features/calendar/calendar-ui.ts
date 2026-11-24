// Shared labels and colour classes for the calendar (DESIGN_SYSTEM › Calendar post card, All-day event bar).
import { type Platform, PLATFORM_FILL, PLATFORM_NAME } from "../../lib/platforms";
import type { EventKind } from "./events";

export type CardStatus = "idea" | "drafting" | "approved" | "posted";
export type CardPlatform = Platform;
export type CardOrigin = "manual" | "idea" | "ai";

export type CalendarCard = {
  id: string;
  date: string; // YYYY-MM-DD
  platform: CardPlatform | null;
  format: string | null;
  title: string;
  hook: string | null;
  caption: string | null;
  visual_idea: string | null;
  status: CardStatus;
  origin: CardOrigin;
  idea_id: string | null;
  /** last save (the 09 "edited … ago") */
  updated_at: string;
  /** 09 health-claim check (check-claims): null / 'unchecked' until checked. Advisory only. */
  compliance_status: "unchecked" | "clear" | "flagged" | null;
  /** check-claims' { v, hash, issues } as JSON text (read with readComplianceNotes). */
  compliance_notes: string | null;
  /** who made it (profiles.full_name via created_by); null if that profile is gone */
  creator: { full_name: string | null } | null;
};

export const STATUSES: CardStatus[] = ["idea", "drafting", "approved", "posted"];

export const STATUS_LABEL: Record<CardStatus, string> = {
  idea: "Idea",
  drafting: "Drafting",
  approved: "Approved",
  posted: "Posted",
};

/** Status dots (Figma 08 legend): idea bloom, drafting breeze, approved fresh, posted grey. */
export const STATUS_DOT: Record<CardStatus, string> = {
  idea: "bg-bloom",
  drafting: "bg-breeze",
  approved: "bg-fresh",
  posted: "bg-muted",
};

/** Soft status pills in the 09 header. */
export const STATUS_PILL: Record<CardStatus, string> = {
  idea: "bg-status-idea",
  drafting: "bg-status-drafting",
  approved: "bg-status-approved",
  posted: "bg-status-posted",
};

/** 09 / M08 card header tint by platform (none = soft grey). */
export const PLATFORM_TINT: Record<CardPlatform | "none", string> = {
  instagram: "bg-tint-instagram",
  tiktok: "bg-tint-tiktok",
  linkedin: "bg-tint-linkedin",
  facebook: "bg-tint-facebook",
  none: "bg-soft",
};

/** 3 px bar on the card's left edge: Instagram pop, TikTok breeze, LinkedIn blue, Facebook fresh, none = line. */
export const PLATFORM_BAR: Record<CardPlatform | "none", string> = {
  ...PLATFORM_FILL,
  none: "bg-line",
};

export const PLATFORM_LABEL: Record<CardPlatform, string> = PLATFORM_NAME;
export const PLATFORM_SHORT: Record<CardPlatform, string> = {
  instagram: "IG",
  tiktok: "TT",
  linkedin: "LI",
  facebook: "FB",
};

/** Formats each platform supports (the same names the pulls use). */
export const FORMATS: Record<CardPlatform, string[]> = {
  instagram: ["reel", "carousel", "image"],
  tiktok: ["video", "carousel"],
  // Slice 15c: LinkedIn's formats as the pulls name them ("article" is shown as "Link").
  linkedin: ["text", "image", "document", "video", "article", "poll"],
  // Slice 16c: Facebook ("carousel" is shown as "Album", "article" as "Link").
  facebook: ["reel", "video", "image", "carousel", "article", "text"],
};
export const FORMAT_NAME: Record<string, string> = {
  reel: "Reel",
  carousel: "Carousel",
  image: "Image",
  video: "Video",
  text: "Text",
  document: "Document",
  article: "Link",
  poll: "Poll",
};

/** A format's name on a platform: Facebook's multi-image posts are albums ("Album"). */
export function formatName(platform: CardPlatform | null | undefined, format: string): string {
  if (platform === "facebook" && format === "carousel") return "Album";
  return FORMAT_NAME[format] ?? format;
}

/** "IG · REEL" / "FB · ALBUM" (mono, uppercased by CSS). Missing parts are left out. */
export function cardMeta(card: Pick<CalendarCard, "platform" | "format">): string {
  const parts = [
    card.platform ? PLATFORM_SHORT[card.platform] : null,
    card.format ? formatName(card.platform, card.format) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No platform";
}

/** All-day bars: holidays flash, health bloom, marketing breeze. */
export const EVENT_BG: Record<EventKind, string> = {
  holiday: "bg-flash",
  health: "bg-bloom",
  marketing: "bg-breeze",
};

export const EVENT_TOGGLE_LABEL: Record<EventKind, string> = {
  holiday: "Holidays",
  health: "Health",
  marketing: "Marketing",
};

/** Order of the toggles (Figma 08 / M07). */
export const TOGGLE_ORDER: EventKind[] = ["holiday", "health", "marketing"];
