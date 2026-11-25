// Slice 17c: client settings, archive / delete and manual Add client. Pure rules (tested in
// client-rules.test.ts). Checks are decided by code from the regulated topics, never by the model.
import { differenceInCalendarDays } from "date-fns";
import { plural } from "./format";
import { PLATFORM_NAME, PLATFORMS, type Platform } from "./platforms";

/** The fixed list (clients.regulated check constraint, 17a migration). */
export const REGULATED = [
  "health",
  "medical claims",
  "weight loss",
  "pharma",
  "supplements",
  "finance",
  "alcohol",
  "gambling",
  "tobacco",
  "cannabis",
  "kids",
  "legal",
] as const;
export type Regulated = (typeof REGULATED)[number];

export type CheckKind = "health" | "finance" | "age" | "kids";
export const CHECK_LABEL: Record<CheckKind, string> = {
  health: "Health claims",
  finance: "Finance",
  age: "Age (alcohol, gambling)",
  kids: "Kids",
};

/**
 * Which content checks run for a client (BUILD_PLAN › Slice 17 › Rules): health / medical claims /
 * weight loss / pharma / supplements → Health claims; finance → Finance; alcohol / gambling / cannabis /
 * tobacco → Age; Kids only when the audience is children.
 */
export function checksFor(
  regulated: readonly string[],
  audienceIsKids: boolean,
): Record<CheckKind, boolean> {
  const has = (...topics: string[]) => topics.some((t) => regulated.includes(t));
  return {
    health: has("health", "medical claims", "weight loss", "pharma", "supplements"),
    finance: has("finance"),
    age: has("alcohol", "gambling", "cannabis", "tobacco"),
    kids: audienceIsKids,
  };
}

const CHECK_SHORT: Record<CheckKind, string> = {
  health: "health-claim",
  finance: "finance",
  age: "age",
  kids: "kids",
};

/** "health, weight loss → the health-claim check is on." (16, after "Blip detected:") */
export function checksSummary(regulated: readonly string[], audienceIsKids: boolean): string {
  const on = (Object.entries(checksFor(regulated, audienceIsKids)) as [CheckKind, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => CHECK_SHORT[k]);
  if (regulated.length === 0) return "No regulated topics. Content checks are off.";
  if (on.length === 0) return `${regulated.join(", ")}: no content check needed.`;
  const checks = on.length === 1 ? `the ${on[0]} check is` : `the ${on.join(" and ")} checks are`;
  return `${regulated.join(", ")} → ${checks} on.`;
}

export type ContentRule = {
  id: string;
  rule: string;
  why?: string | null;
  quote?: string | null;
  source: "blip" | "team";
  added_by_name?: string | null;
  added_at?: string | null;
};

/** URL slug from a client name: "All The Best Co." → "all-the-best-co". */
export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s || "client";
}

/** First free slug: "acme", then "acme-2", "acme-3"… (renaming a client never changes its slug). */
export function uniqueSlug(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

/** The site's host without www, for "already used by" checks: "https://www.OBUhealth.com/x" → "obuhealth.com". */
export function siteHost(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return null;
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Stored website: "https://{host}" (paths and tracking params dropped). */
export function normaliseWebsite(input: string): string | null {
  const host = siteHost(input);
  return host ? `https://${host}` : null;
}

/** 16d: the typed name must match the client's (case-insensitive, trimmed, inner spaces collapsed). */
export function deleteConfirmMatches(typed: string, name: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(typed) !== "" && norm(typed) === norm(name);
}

/** 16c: "Archived 3 days ago · Fatima" (today / yesterday too). */
export function archivedLabel(
  archivedAt: string,
  byName: string | null | undefined,
  now: Date = new Date(),
): string {
  const days = Math.max(0, differenceInCalendarDays(now, new Date(archivedAt)));
  const when = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return `Archived ${when}${byName ? ` · ${byName}` : ""}`;
}

/** First name for "· Fatima" / "Added by Fatima". */
export function firstNameFrom(full: string | null | undefined, email?: string | null): string {
  const n = full?.trim().split(/\s+/)[0];
  if (n) return n;
  const local = email?.split("@")[0]?.split(/[._-]/)[0];
  return local ? local[0].toUpperCase() + local.slice(1) : "";
}

export type PlatformRowKind = "always" | "toggle" | "later";
export type PlatformRow = {
  platform: string;
  name: string;
  kind: PlatformRowKind;
  on: boolean;
  meta: string;
  supported: boolean;
};

const LATER_NAME: Record<string, string> = {
  pinterest: "Pinterest",
  youtube: "YouTube",
  threads: "Threads",
};

const isSupported = (p: string): p is Platform => (PLATFORMS as string[]).includes(p);

/**
 * Platforms card rows (16 / M19). Website-linked → "always" (lock chip ALWAYS ON); team-added → toggle;
 * not supported yet → "later" (COMING LATER, no toggle). Supported platforms without a row are offered as
 * team rows, off. Order: supported in the usual order, then the coming-later ones.
 */
export function platformRows(
  rows: readonly {
    platform: string;
    state: string;
    source: string;
    account_url: string | null;
    account_handle: string | null;
  }[],
): PlatformRow[] {
  const byPlatform = new Map(rows.map((r) => [r.platform, r]));
  const account = (r: (typeof rows)[number]) =>
    r.account_handle
      ? `@${r.account_handle.replace(/^@/, "")}`
      : r.account_url?.replace(/^https?:\/\/(www\.)?/, "");
  const out: PlatformRow[] = PLATFORMS.map((p) => {
    const r = byPlatform.get(p);
    if (!r)
      return {
        platform: p,
        name: PLATFORM_NAME[p],
        kind: "toggle",
        on: false,
        meta: "Not tracked",
        supported: true,
      };
    const website = r.source === "website";
    const acc = account(r);
    return {
      platform: p,
      name: PLATFORM_NAME[p],
      kind: website ? "always" : "toggle",
      on: website || r.state === "on",
      meta: website
        ? `${acc ?? "Linked"} · from the website`
        : acc
          ? `${acc} · added by the team`
          : "Added by the team · competitors’ pages only",
      supported: true,
    };
  });
  for (const r of rows) {
    if (isSupported(r.platform)) continue;
    const acc = account(r);
    out.push({
      platform: r.platform,
      name: LATER_NAME[r.platform] ?? r.platform[0].toUpperCase() + r.platform.slice(1),
      kind: "later",
      on: r.state === "on",
      meta: `${acc ?? "Linked"} · ${r.source === "website" ? "from the website" : "added by the team"}`,
      supported: false,
    });
  }
  return out;
}

/**
 * Where you land after archiving (16b): your last other active client (this browser), else the first
 * active one A–Z, else nothing (→ Add client).
 */
export function landingAfterArchive<
  T extends { id: string; slug: string; name: string; archived_at: string | null },
>(clients: readonly T[], archivedId: string, storedSlug?: string | null): T | undefined {
  const active = clients.filter((c) => c.id !== archivedId && !c.archived_at);
  return (
    active.find((c) => c.slug === storedSlug) ??
    [...active].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))[0]
  );
}

/** 16d: "This deletes its 6 competitors, 2 saved pulls (214 posts), 38 ideas and 12 calendar cards, …" */
export function countsSentence(c: {
  competitors: number;
  pulls: number;
  posts: number;
  ideas: number;
  cards: number;
}): string {
  return `This deletes its ${plural(c.competitors, "competitor")}, ${plural(c.pulls, "saved pull")} (${plural(c.posts, "post")}), ${plural(c.ideas, "idea")} and ${plural(c.cards, "calendar card")}, and removes their images from storage. Usage history keeps the name. This can’t be undone.`;
}

/**
 * Manual Add client (15f): the client's platforms. Instagram, TikTok, LinkedIn and Facebook are tracked
 * (team rows, on), with the client's own account where one was given; X and YouTube only when a handle
 * was given (Slices 17g / 18: on for clients that use them). Instagram / TikTok / X / YouTube are handles;
 * Facebook / LinkedIn are page URLs.
 */
export function manualPlatformRows(accounts: Partial<Record<Platform, string | null>>) {
  return PLATFORMS.filter((p) => (p !== "x" && p !== "youtube") || !!accounts[p]).map((p) => {
    const v = accounts[p] ?? null;
    const isUrl = p === "facebook" || p === "linkedin";
    return {
      platform: p as string,
      state: "on" as const,
      source: "team" as const,
      account_url: isUrl ? v : null,
      account_handle: isUrl ? null : v,
    };
  });
}

const FILLER = new Set(["the", "and", "of", "a", "an", "co", "inc", "llc", "ltd", "&", "+"]);

/**
 * Initials for a new client's mark: the first letters of its first two meaningful words ("All The Best
 * Co" → "AB", "OBU Health" → "OH"), else the first two letters ("Baskits" → "BA"). Saved on the client.
 */
export function initialsFor(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w && !FILLER.has(w.toLowerCase()));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? name.trim()).slice(0, 2).toUpperCase();
}

export type CheckCopy = { checking: string; clear: string };

/**
 * The card's check note (09 / M08) for this client (Slice 17e), or null when there's nothing to check
 * (no check on and no content rules: the check doesn't run). Health keeps its original copy.
 */
export function checkCopy(client: {
  name: string;
  regulated: readonly string[];
  audience_is_kids: boolean;
  content_rules: readonly unknown[];
}): CheckCopy | null {
  const c = checksFor(client.regulated, client.audience_is_kids);
  if (c.health) {
    return {
      checking: "Blip’s checking for health claims…",
      clear: "No health claims found. Supportive tone, no food guilt.",
    };
  }
  const what = c.finance ? "finance claims" : c.age ? "age rules" : c.kids ? "kids rules" : null;
  if (what)
    return { checking: `Blip’s checking for ${what}…`, clear: `Nothing to flag for ${what}.` };
  if (client.content_rules.length === 0) return null;
  const name = client.name.trim() || "the client";
  const who = /s$/i.test(name) ? `${name}’` : `${name}’s`;
  return {
    checking: `Blip’s checking against ${who} content rules…`,
    clear: `Nothing breaks ${who} content rules.`,
  };
}
