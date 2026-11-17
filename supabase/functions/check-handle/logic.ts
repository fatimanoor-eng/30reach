// Pure rules for the `check-handle` Edge Function (Slice 8, INTEGRATIONS.md §2c). Tested in logic.test.ts.
import type { PageResult, Platform } from "../_shared/pull-logic.ts";

/** Handles are stored lowercase without "@". Instagram 1–30 chars, TikTok 2–24; letters, digits, . and _. */
export const HANDLE_PATTERN: Record<Platform, RegExp> = {
  instagram: /^[a-z0-9._]{1,30}$/,
  tiktok: /^[a-z0-9._]{2,24}$/,
};

/** A check costs at most one first page (2 credits); refuse if the balance can't cover it. */
export const CHECK_COST = 2;

export type CheckRequest = { platform: Platform; handle: string };

/** Body → request, or the error code to return (400). The browser already normalises; this re-checks. */
export function parseCheckRequest(body: Record<string, unknown>): CheckRequest | { error: string } {
  const platform = body.platform;
  if (platform !== "instagram" && platform !== "tiktok") return { error: "bad_platform" };
  const raw =
    typeof body.handle === "string" ? body.handle.trim().replace(/^@/, "").toLowerCase() : "";
  if (!HANDLE_PATTERN[platform].test(raw)) return { error: "bad_handle" };
  return { platform, handle: raw };
}

export type CheckOutcome =
  | { status: "ok" | "not_found"; creditsUsed: number; followers: number | null }
  | { error: string; creditsUsed: number };

/**
 * One parsed first page → outcome. Provider "not_found" = the handle doesn't exist (0 credits in the
 * spike); any page of posts (even empty) = the account exists and is readable. Other provider errors
 * are passed on so the panel can say "couldn't check, try again" instead of marking the handle wrong.
 */
export function checkOutcome(page: PageResult): CheckOutcome {
  if (page.kind === "ok")
    return { status: "ok", creditsUsed: page.creditsCost, followers: page.followers };
  if (page.code === "not_found") return { status: "not_found", creditsUsed: page.creditsCost };
  return { error: page.code, creditsUsed: page.creditsCost };
}
