// Competitors (Slice 8: 07 / 07b / 07c; LinkedIn Slice 15a). Pure rules, tested in competitor-rules.test.ts.
import {
  type Platform,
  PLATFORM_NAME,
  PLATFORMS,
  STATUS_KEY,
  TARGET_KEY,
} from "../../lib/platforms";
import type { Competitor } from "../../lib/useCompetitors";

export { PLATFORM_NAME, PLATFORMS };
/** Credits per handle / LinkedIn page that exists (spikes: 2, LinkedIn 1–2); not found = 0. */
export const CHECK_COST = 2;

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
const PATTERN: Record<Exclude<Platform, "linkedin">, RegExp> = {
  instagram: /^[a-z0-9._]{1,30}$/,
  tiktok: /^[a-z0-9._]{2,24}$/,
};

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

export type HandleInput =
  { kind: "empty" } | { kind: "ok"; handle: string } | { kind: "invalid"; message: string };

/**
 * What someone typed → what's stored. Instagram/TikTok: the handle (lowercase, no "@"); accepts "@noom",
 * "noom" or a profile link ("instagram.com/noom/", "https://www.tiktok.com/@noom?lang=en"). LinkedIn:
 * the canonical company page URL; accepts a page link or its slug. Invalid input never costs credits.
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
  const host = platform === "instagram" ? "instagram\\.com" : "tiktok\\.com";
  const link = v.match(new RegExp(`^(?:https?://)?(?:www\\.|m\\.)?${host}/@?([^/?#]+)`, "i"));
  if (link) v = link[1];
  v = v.replace(/^@/, "").toLowerCase();
  if (PATTERN[platform].test(v)) return { kind: "ok", handle: v };
  return {
    kind: "invalid",
    message:
      platform === "instagram"
        ? "Use letters, numbers, dots or underscores (up to 30)."
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
