// Settings (13 / M12) rules. Pure functions, tested in settings-rules.test.ts.

import { formatShortDate } from "../../lib/format";

// ───────────────────────────── free-tier limits (CLAUDE.md rule 2)
export const DB_LIMIT_BYTES = 500 * 1024 * 1024; // Supabase free: 500 MB database
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024; // Supabase free: 1 GB storage
export const GROQ_DAY_LIMIT_FALLBACK = 1000; // shown until Groq's header has told us the real one

/** "42 MB", "1.2 MB", "860 KB", "0 KB" (1 MB = 1024 KB, like Supabase's dashboard). */
export function formatBytes(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1).replace(/\.0$/, "") : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1).replace(/\.0$/, "") : Math.round(gb)} GB`;
}

/** 0 … 1 for a meter's fill (never outside, never NaN). */
export const fill = (used: number, limit: number) =>
  limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;

/**
 * Groq's reset header ("2m59.56s", "7.66s", "1h2m", "450ms") in milliseconds, or null.
 */
export function parseGroqDuration(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:([\d.]+)ms)?$/.exec(s.trim());
  if (!m || !m.slice(1).some(Boolean)) return null;
  const [h, min, sec, ms] = m.slice(1).map((x) => (x ? Number(x) : 0));
  return ((h * 60 + min) * 60 + sec) * 1000 + ms;
}

export type GroqMeterRow = {
  value: {
    remaining_requests?: number | null;
    limit_requests?: number | null;
    reset_requests?: string | null;
  } | null;
  updated_at: string | null;
};

/**
 * Groq requests used today, from the last AI call's x-ratelimit-* headers (usage_meters.groq).
 * Only as fresh as that call; if Groq's reset time has passed since, the day's count is back to 0.
 * Null when no AI call has been made yet.
 */
export function groqToday(
  row: GroqMeterRow | null,
  now: number,
): { used: number; limit: number; asOf: string } | null {
  const v = row?.value;
  if (!v || typeof v.remaining_requests !== "number" || !row?.updated_at) return null;
  const limit = typeof v.limit_requests === "number" ? v.limit_requests : GROQ_DAY_LIMIT_FALLBACK;
  const at = Date.parse(row.updated_at);
  const reset = parseGroqDuration(v.reset_requests);
  const used =
    reset !== null && !Number.isNaN(at) && now >= at + reset
      ? 0
      : Math.max(0, limit - v.remaining_requests);
  return { used, limit, asOf: row.updated_at };
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then "12 Nov". */
export function ago(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return d === 1 ? "yesterday" : `${d} days ago`;
  return formatShortDate(iso) ?? "";
}

/** Team row: "Signed in 2 days ago" (Supabase Auth's last sign-in), or null if unknown. */
export function lastSignInLabel(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const when = ago(iso, now);
  if (!when) return null;
  // A date ("12 Nov", "3 Jan 2025") reads "on 12 Nov"; "2 days ago" doesn't.
  return /^\d{1,2} [A-Z][a-z]{2}/.test(when) ? `Signed in on ${when}` : `Signed in ${when}`;
}

// ───────────────────────────── team

export type Member = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "member";
  disabled_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
};

export const memberName = (m: Pick<Member, "full_name" | "email">) =>
  m.full_name?.trim() || m.email.split("@")[0];

/** "FN" from "Fatima Noor", "R" from "ryan@…" */
export function memberInitials(m: Pick<Member, "full_name" | "email">): string {
  const words = memberName(m).split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0]?.[0];
  return (letters ?? "?").toUpperCase();
}

/** Active admins other than `except` (the database enforces the same: never zero). */
export const otherActiveAdmins = (team: Member[], except: string) =>
  team.filter((m) => m.role === "admin" && !m.disabled_at && m.id !== except).length;

export type RoleChoice = "admin" | "member" | "remove";

/**
 * What an admin may pick for a person: Admin / Member, and "Remove access…" for anyone but
 * themselves. Demoting or removing the last active admin is offered but explained (the database
 * refuses it either way); see roleBlockedReason.
 */
export function roleChoices(target: Member, meId: string): RoleChoice[] {
  return target.id === meId ? ["admin", "member"] : ["admin", "member", "remove"];
}

/** Why a choice can't be made, before asking the server (same rules as the SQL functions). */
export function roleBlockedReason(
  team: Member[],
  target: Member,
  choice: RoleChoice,
  meId: string,
): string | null {
  if (choice === "remove" && target.id === meId) return TEAM_ERRORS.cannot_remove_self;
  const leavesNoAdmin =
    target.role === "admin" &&
    !target.disabled_at &&
    (choice === "member" || choice === "remove") &&
    otherActiveAdmins(team, target.id) === 0;
  return leavesNoAdmin ? TEAM_ERRORS.last_admin : null;
}

/** Server error codes (set_member_role / set_member_access) → what to say. */
export const TEAM_ERRORS: Record<string, string> = {
  last_admin: "30reach needs at least one admin. Make someone else an admin first.",
  cannot_remove_self: "You can’t remove your own access.",
  member_removed: "Restore their access first.",
  member_not_found: "That person isn’t on the team any more.",
  not_admin: "Only admins can change the team.",
};
export const teamErrorText = (code: string | undefined) =>
  (code && TEAM_ERRORS[code]) || "Couldn’t save that. Check your connection and try again.";
