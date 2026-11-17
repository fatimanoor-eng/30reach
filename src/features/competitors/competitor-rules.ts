// Competitors (Slice 8: 07 / 07b / 07c). Pure rules, tested in competitor-rules.test.ts.
import type { Platform } from "../../lib/pulls/api";
import type { Competitor } from "../../lib/useCompetitors";

export const PLATFORMS: Platform[] = ["instagram", "tiktok"];
export const PLATFORM_NAME: Record<Platform, string> = { instagram: "Instagram", tiktok: "TikTok" };
export const CHECK_COST = 2; // credits per handle that exists (Slice 1 spike); not found = 0

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
const PATTERN: Record<Platform, RegExp> = {
  instagram: /^[a-z0-9._]{1,30}$/,
  tiktok: /^[a-z0-9._]{2,24}$/,
};

export type HandleInput =
  { kind: "empty" } | { kind: "ok"; handle: string } | { kind: "invalid"; message: string };

/**
 * What someone typed → a stored handle (lowercase, no "@"). Accepts "@noom", "noom" or a profile link
 * ("instagram.com/noom/", "https://www.tiktok.com/@noom?lang=en"). Invalid input never costs credits.
 */
export function parseHandle(platform: Platform, input: string): HandleInput {
  let v = input.trim();
  if (!v) return { kind: "empty" };
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

/** Another competitor already uses this handle on this platform? (case-insensitive) */
export function duplicateOf(
  competitors: Competitor[],
  platform: Platform,
  handle: string,
  exceptId?: string,
): Competitor | null {
  const key = platform === "instagram" ? "instagram_handle" : "tiktok_handle";
  return (
    competitors.find((c) => c.id !== exceptId && c[key]?.toLowerCase() === handle.toLowerCase()) ??
    null
  );
}

// ───────────────────────────────────────────── status chip (07)
export type StatusTone = "ok" | "danger" | "neutral";

/** OK · "TikTok not found" / "Instagram not found" / "Not found" · "Not checked". Missing handles are ignored. */
export function competitorStatus(c: Competitor): { label: string; tone: StatusTone } {
  const present = PLATFORMS.filter(
    (p) => !!(p === "instagram" ? c.instagram_handle : c.tiktok_handle),
  );
  const status = (p: Platform) => (p === "instagram" ? c.instagram_status : c.tiktok_status);
  const missing = present.filter((p) => status(p) === "not_found");
  if (missing.length === 2) return { label: "Not found", tone: "danger" };
  if (missing.length === 1)
    return { label: `${PLATFORM_NAME[missing[0]]} not found`, tone: "danger" };
  if (present.length === 0 || present.some((p) => status(p) === "unchecked"))
    return { label: "Not checked", tone: "neutral" };
  return { label: "OK", tone: "ok" };
}
