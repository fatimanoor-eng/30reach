// Slice 17d: Add client from a website (15b–15g, M14–M18). Pure rules: the scanning checklist, review
// defaults, what Create inserts, the summary and welcome lines. Tested in add-client-rules.test.ts.
import type { ContentRule } from "../../../lib/client-rules";
import { plural } from "../../../lib/format";
import { PLATFORM_NAME, PLATFORMS, type Platform } from "../../../lib/platforms";
import { suggestInitials, youtubeTarget } from "../../competitors/competitor-rules";

export type FoundPlatform = Platform | "youtube" | "pinterest" | "threads";
export type FoundAccount = { platform: FoundPlatform; handle: string | null; url: string | null };

/** scan-site (client mode) answer. */
export type SiteScan = {
  status: "ok";
  credits: number;
  website: string;
  name: string;
  description: string;
  country: string;
  language: string;
  industry: string;
  audience: string;
  regulated: string[];
  audienceIsKids: boolean;
  healthMonths: boolean;
  rules: { id: string; rule: string; why: string; quote: string }[];
  queries: string[];
  scope: "local" | "national";
  color: string | null;
  logoPath: string | null;
  logoUrl: string | null;
  accounts: FoundAccount[];
};

/** Instagram followers read from a search snippet (approximate; Discovery 2.0 "Big in your space"). */
export type SnippetFollowers = { platform: "instagram"; handle: string; count: number };

/** A suggested competitor and what its home page links (null = not read yet / couldn't be read). */
export type Suggestion = {
  name: string;
  website: string;
  domain: string;
  about: string;
  accounts: FoundAccount[] | null;
  unreadable?: boolean;
  /** Discovery 2.0: one line, why it's suggested. */
  why?: string;
  /** "rival" = Closest rivals (default), "big" = Big in your space. */
  group?: "rival" | "big";
  /** A 128 px square logo from its site (client-logos), and a signed URL to show it. */
  logoPath?: string | null;
  logoUrl?: string | null;
  followers?: SnippetFollowers | null;
};

/** Closest rivals whose home pages are read during the scan (the rest, and big brands, on tick). */
export const SCAN_UP_FRONT = 8;

export const PLATFORM_LABEL: Record<FoundPlatform, string> = {
  ...PLATFORM_NAME,
  x: "X",
  youtube: "YouTube",
  pinterest: "Pinterest",
  threads: "Threads",
};
export const isSupported = (p: string): p is Platform => (PLATFORMS as string[]).includes(p);

/** "@shop_allthebest" / "shop.at.atb" (Facebook page) / "baskits-inc" (LinkedIn page). */
export function accountLabel(a: FoundAccount): string {
  if (a.handle) return `@${a.handle}`;
  const url = a.url ?? "";
  const id = url.match(/[?&]id=(\d+)/);
  if (id) return `facebook.com/profile.php?id=${id[1]}`;
  return url
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/^(facebook\.com|linkedin\.com\/company)\//, "")
    .replace(/\/$/, "");
}

// ───────────────────────────────────────────── 15c checklist
export type RowState = "done" | "active" | "next" | "muted";
export type ChecklistRow = { key: string; label: string; meta: string; state: RowState };

export type ScanProgress = {
  website: string;
  scan: SiteScan | null;
  /** null = not searched yet; [] = searched, none found. */
  suggestions: Suggestion[] | null;
  /** How many suggestions have had their home page read. */
  accountsRead: number;
  searching: boolean;
  /** Big in your space found (Discovery 2.0); counted in "N FOUND", read only on tick. */
  bigCount?: number;
};

/** The checklist (15c / M15): what was found so far, the step in progress, and what's next. */
export function checklistRows(
  p: ScanProgress,
  { short = false }: { short?: boolean } = {},
): ChecklistRow[] {
  const rows: ChecklistRow[] = [];
  const s = p.scan;
  if (!s) {
    rows.push({
      key: "page",
      label: `Reading ${p.website.replace(/^https?:\/\//, "")}`,
      meta: "",
      state: "active",
    });
    rows.push({ key: "profile", label: "Content profile", meta: "NEXT", state: "next" });
  } else {
    rows.push({ key: "name", label: `Name · ${s.name}`, meta: "FOUND", state: "done" });
    const brand = s.logoPath || s.color;
    rows.push({
      key: "brand",
      label: short ? "Logo and colour" : "Logo and brand colour",
      meta: brand ? "FOUND" : "NOT FOUND",
      state: brand ? "done" : "muted",
    });
    for (const a of s.accounts) {
      rows.push({
        key: `acc-${a.platform}`,
        label: `${PLATFORM_LABEL[a.platform]} · ${accountLabel(a)}`,
        meta: isSupported(a.platform) ? "FOUND" : "COMING LATER",
        state: "done",
      });
    }
    const missing = (PLATFORMS as FoundPlatform[]).filter(
      (p) => !s.accounts.some((a) => a.platform === p),
    );
    if (missing.length) {
      rows.push({
        key: "missing",
        label: missing.map((m) => PLATFORM_LABEL[m]).join(", "),
        meta: short ? "NOT ON SITE" : "NOT ON THEIR SITE",
        state: "muted",
      });
    }
    const where = [s.industry, s.country].filter(Boolean).join(", ");
    rows.push({
      key: "profile",
      label: short || !where ? "Content profile" : `Content profile · ${where}`,
      meta: "DONE",
      state: "done",
    });
  }
  const q = s?.queries[0];
  rows.push(
    p.suggestions
      ? {
          key: "competitors",
          label: "Competitors",
          meta: `${p.suggestions.length + (p.bigCount ?? 0)} FOUND`,
          state: "done",
        }
      : {
          key: "competitors",
          label: !short && p.searching && q ? `Competitors · searching “${q}”` : "Competitors",
          meta: p.searching ? "SEARCHING" : "NEXT",
          state: p.searching ? "active" : "next",
        },
  );
  // Only the top closest rivals are read up front (Discovery 2.0); the rest when ticked in Review.
  const n = Math.min(p.suggestions?.length ?? 0, SCAN_UP_FRONT);
  rows.push({
    key: "accounts",
    label: short ? "Their social accounts" : "Competitors’ social accounts",
    meta: !p.suggestions ? "NEXT" : p.accountsRead >= n ? "DONE" : `${p.accountsRead} OF ${n}`,
    state: !p.suggestions ? "next" : p.accountsRead >= n ? "done" : "active",
  });
  return rows;
}

// ───────────────────────────────────────────── 15d review
export type PlatformDraft = {
  platform: FoundPlatform;
  source: "website" | "team";
  on: boolean;
  /** What the team typed for a platform the site doesn't link (handle or page link). */
  input: string;
  account: FoundAccount | null;
};

export type CompetitorDraft = {
  key: string;
  name: string;
  website: string;
  domain: string;
  about: string;
  accounts: FoundAccount[];
  ticked: boolean;
  /** Typed accounts for a competitor whose site links none (or one added by hand). */
  inputs: Partial<Record<Platform, string>>;
  manual?: boolean;
  /** Discovery 2.0 */
  why?: string;
  group?: "rival" | "big";
  /** Its home page was read (accounts + logo). Not yet → read when ticked (1 credit). */
  scanned?: boolean;
  logoPath?: string | null;
  logoUrl?: string | null;
  followers?: SnippetFollowers | null;
  /** Its site is being read right now (ticked in Review). */
  scanning?: boolean;
  /** "no accounts found · add" was pressed: focus the handle field. */
  adding?: boolean;
};

export type ReviewDraft = {
  name: string;
  description: string;
  website: string;
  country: string;
  language: string;
  industry: string;
  audience: string;
  color: string;
  logoPath: string | null;
  logoUrl: string | null;
  regulated: string[];
  audienceIsKids: boolean;
  healthMonths: boolean;
  rules: ContentRule[];
  platforms: PlatformDraft[];
  competitors: CompetitorDraft[];
};

const supportedAccounts = (accounts: readonly FoundAccount[] | null) =>
  (accounts ?? []).filter((a) => isSupported(a.platform));

/**
 * Review defaults (15d): the scan's fields; platforms linked on the site are ALWAYS ON (website rows),
 * Instagram / TikTok / LinkedIn / Facebook / X not on the site are team rows, off; competitors pre-ticked:
 * the first 4 whose site links a platform 30reach pulls.
 */
export function reviewDefaults(
  scan: SiteScan,
  suggestions: readonly Suggestion[],
  big: readonly Suggestion[] = [],
): ReviewDraft {
  const site = scan.accounts.map((a): PlatformDraft => ({
    platform: a.platform,
    source: "website",
    on: true,
    input: "",
    account: a,
  }));
  const team = (PLATFORMS as FoundPlatform[])
    .filter((p) => !scan.accounts.some((a) => a.platform === p))
    .map((p): PlatformDraft => ({
      platform: p,
      source: "team",
      on: false,
      input: "",
      account: null,
    }));
  let ticks = 0;
  return {
    name: scan.name,
    description: scan.description,
    website: scan.website,
    country: scan.country,
    language: scan.language,
    industry: scan.industry,
    audience: scan.audience,
    color: scan.color ?? "",
    logoPath: scan.logoPath,
    logoUrl: scan.logoUrl,
    regulated: scan.regulated,
    audienceIsKids: scan.audienceIsKids,
    healthMonths: scan.healthMonths,
    rules: scan.rules.map((r) => ({ ...r, source: "blip" as const })),
    platforms: [...site, ...team],
    competitors: [
      ...suggestions.map((s) => {
        const tick = ticks < 4 && supportedAccounts(s.accounts).length > 0;
        if (tick) ticks++;
        return draftOf(s, "rival", tick);
      }),
      // Big in your space: unticked; their pages are read only if someone ticks them.
      ...big.map((s) => draftOf(s, "big", false)),
    ],
  };
}

function draftOf(s: Suggestion, group: "rival" | "big", ticked: boolean): CompetitorDraft {
  return {
    key: s.domain,
    name: s.name,
    website: s.website,
    domain: s.domain,
    about: s.about,
    accounts: s.accounts ?? [],
    ticked,
    inputs: {},
    why: s.why ?? "",
    group,
    scanned: s.accounts !== null || !!s.unreadable,
    logoPath: s.logoPath ?? null,
    logoUrl: s.logoUrl ?? null,
    followers: s.followers ?? null,
  };
}

/** Platforms that will be pulled: supported ones that are on (website rows always are). */
export const platformsOn = (d: Pick<ReviewDraft, "platforms">): Platform[] =>
  PLATFORMS.filter((p) => d.platforms.some((x) => x.platform === p && x.on));

/** Sticky bar (15d / M16): "4 COMPETITORS · 2 PLATFORMS · FIRST PULL IS NEXT". */
export function summaryLine(d: ReviewDraft, { short = false } = {}): string {
  const n = d.competitors.filter((c) => c.ticked).length;
  const parts = [plural(n, "competitor"), plural(platformsOn(d).length, "platform")];
  if (!short) parts.push("first pull is next");
  return parts.join(" · ").toUpperCase();
}

/**
 * Competitor row meta (15d; Discovery 2.0): "carnabyandvine.com · luxury gift boxes", "… · added by hand".
 * Accounts not found is said separately (with "add"), so it's left out here.
 */
export function competitorMeta(c: CompetitorDraft, { short = false } = {}): string {
  if (short) return c.domain;
  return [c.domain, c.manual ? "added by hand" : c.about].filter(Boolean).join(" · ");
}

/** Read, and no account on a platform 30reach pulls (the row offers "no accounts found · add"). */
export const noAccountsFound = (c: CompetitorDraft) =>
  (c.scanned ?? true) &&
  !c.manual &&
  c.accounts.filter((a) => isSupported(a.platform)).length === 0;

// ───────────────────────────────────────────── Create (rows)
export type ParsedInput = { value: string | null; error?: string };
export type ParseAccount = (platform: Platform, input: string) => ParsedInput;

/** client_platforms rows: site links (website, on); team platforms (on with their typed account, or off). */
export function platformRowsForCreate(d: ReviewDraft, parse: ParseAccount) {
  return d.platforms
    .filter((p) => p.source === "website" || isSupported(p.platform) || p.on)
    .map((p) => {
      const isUrl = p.platform === "facebook" || p.platform === "linkedin";
      const typed =
        p.source === "team" && p.on && p.input.trim() && isSupported(p.platform)
          ? parse(p.platform, p.input).value
          : null;
      const handle = p.account?.handle ?? (!isUrl ? typed : null);
      const url = p.account?.url ?? (isUrl ? typed : null);
      return {
        platform: p.platform as string,
        state: p.source === "website" || p.on ? ("on" as const) : ("off" as const),
        source: p.source,
        account_handle: handle,
        account_url: url,
      };
    });
}

/** competitors rows for the ticked suggestions (+ added by hand): accounts found on their site, or typed. */
export function competitorRowsForCreate(d: ReviewDraft, parse: ParseAccount) {
  const seen = new Set<string>();
  const rows: {
    name: string;
    initials: string;
    logo_path: string | null;
    logo_source: "site" | null;
    instagram_handle: string | null;
    tiktok_handle: string | null;
    linkedin_url: string | null;
    facebook_url: string | null;
    x_handle: string | null;
    youtube_handle: string | null;
  }[] = [];
  for (const c of d.competitors) {
    if (!c.ticked) continue;
    const name = c.name.trim().slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const found = (p: Platform) => c.accounts.find((a) => a.platform === p);
    const typed = (p: Platform) => (c.inputs[p]?.trim() ? parse(p, c.inputs[p]!).value : null);
    rows.push({
      name,
      initials: suggestInitials(name.replace(/(^|\s)[^\p{L}\p{N}\s]+(?=\s|$)/gu, " ")),
      logo_path: c.logoPath ?? null,
      logo_source: c.logoPath ? "site" : null,
      // Big in your space: the Instagram account its follower count came from, if the site wasn't read.
      instagram_handle:
        found("instagram")?.handle ?? typed("instagram") ?? c.followers?.handle ?? null,
      tiktok_handle: found("tiktok")?.handle ?? typed("tiktok"),
      linkedin_url: found("linkedin")?.url ?? typed("linkedin"),
      facebook_url: found("facebook")?.url ?? typed("facebook"),
      x_handle: found("x")?.handle ?? typed("x"),
      // YouTube (18): a site's /channel/UC… link works as it is; old /c/ and /user/ links don't.
      youtube_handle:
        found("youtube")?.handle ?? youtubeTarget(found("youtube")?.url ?? "") ?? typed("youtube"),
    });
  }
  return rows;
}

/** Problems that block Create (15d: name required; typed accounts must be valid). */
export function reviewErrors(d: ReviewDraft, parse: ParseAccount): string[] {
  const errs: string[] = [];
  if (!d.name.trim()) errs.push("name");
  if (d.color.trim() && !/^#[0-9a-f]{6}$/i.test(d.color.trim())) errs.push("color");
  for (const p of d.platforms) {
    if (
      p.source === "team" &&
      p.on &&
      p.input.trim() &&
      isSupported(p.platform) &&
      parse(p.platform, p.input).error
    )
      errs.push(`platform-${p.platform}`);
  }
  for (const c of d.competitors) {
    if (!c.ticked) continue;
    for (const [p, v] of Object.entries(c.inputs) as [Platform, string][]) {
      if (v.trim() && parse(p, v).error) errs.push(`competitor-${c.key}-${p}`);
    }
  }
  return errs;
}

// ───────────────────────────────────────────── 15g welcome
/** "4 competitors · Instagram, Facebook. Press Refresh when you’re ready." / "… First pull is running." */
export function welcomeDetail(
  competitors: number,
  platforms: readonly Platform[],
  pulling: boolean,
): string {
  const where = platforms.map((p) => PLATFORM_NAME[p]).join(", ");
  const head = [plural(competitors, "competitor"), where].filter(Boolean).join(" · ");
  return `${head}. ${pulling ? "First pull is running." : "Press Refresh when you’re ready."}`;
}
