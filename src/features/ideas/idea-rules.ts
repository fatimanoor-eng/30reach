// Pure rules for the idea board (14a / 14b / M09): tabs, search, tags, link labels, ages.
// No React and no Supabase here, so everything is unit-tested in idea-rules.test.ts.
import { formatShortDate } from "../../lib/format";

export type IdeaKind = "screenshot" | "link" | "note" | "post" | "ai";
export type IdeaPlatform = "instagram" | "tiktok";

/** Kept on ideas saved from a post, so they keep their context after old pulls are deleted. */
export type SourceSnapshot = {
  brand?: string;
  date?: string;
  caption?: string | null;
  url?: string | null;
  format?: string | null;
  likes?: number | null;
  comments?: number | null;
  /** Where it was saved from: "overview" | "instagram" | "tiktok" | "ask-blip" | "plan" */
  saved_from?: string;
  /** Plan {month} (AI ideas): the suggested day ("YYYY-MM-DD"); Plan it starts on it. */
  suggested_date?: string;
  /** Plan {month} (AI ideas): Blip's one-line reason. */
  reason?: string;
};

export type Idea = {
  id: string;
  kind: IdeaKind;
  note: string | null;
  image_path: string | null;
  /** Pixel size of the stored image; null when there's none or it was saved before Slice 10b. */
  image_width: number | null;
  image_height: number | null;
  link_url: string | null;
  source_snapshot: SourceSnapshot | null;
  platform: IdeaPlatform | null;
  format: string | null;
  tags: string[];
  planned_card_id: string | null;
  created_at: string;
  /** Who added it (null for AI ideas, or if that person was removed). */
  created_by: string | null;
  creator: { full_name: string | null } | null;
  /** The calendar card this idea became (ideas.planned_card_id → calendar_cards). */
  planned: { id: string; date: string } | null;
};

const FORMAT_LABEL: Record<string, string> = {
  reel: "Reel",
  carousel: "Carousel",
  image: "Image",
  video: "Video",
};
/** "reel" → "Reel"; unknown formats are shown as stored. */
export const formatLabel = (f: string | null | undefined): string | null =>
  f ? (FORMAT_LABEL[f] ?? f) : null;

// ───────────────────────────── tabs + search

export type IdeaTab = "all" | IdeaKind;

export const TABS: { id: IdeaTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "screenshot", label: "Screenshots" },
  { id: "link", label: "Links" },
  { id: "note", label: "Notes" },
  { id: "post", label: "From competitors" },
  { id: "ai", label: "AI ideas" },
];

export function tabCounts(ideas: Pick<Idea, "kind">[]): Record<IdeaTab, number> {
  const counts: Record<IdeaTab, number> = {
    all: ideas.length,
    screenshot: 0,
    link: 0,
    note: 0,
    post: 0,
    ai: 0,
  };
  for (const i of ideas) counts[i.kind] += 1;
  return counts;
}

/** Everything a search can match: note, tags, link, and the source post's brand + caption. */
function haystack(i: Idea): string {
  const s = i.source_snapshot;
  return [i.note, i.link_url, ...i.tags, s?.brand, s?.caption].filter(Boolean).join(" \n ");
}

/** Ideas on a tab that match the search (case-insensitive; every word must appear somewhere). */
export function filterIdeas(ideas: Idea[], tab: IdeaTab, query: string): Idea[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return ideas.filter((i) => {
    if (tab !== "all" && i.kind !== tab) return false;
    if (!words.length) return true;
    const text = haystack(i).toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

// ───────────────────────────── tags

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 24;

/** Trim, squash spaces, cut to 24 characters. Empty → null. */
export function cleanTag(raw: string): string | null {
  const tag = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim();
  return tag || null;
}

/** Add a tag unless it's empty, already there (any case) or the list is full. */
export function addTag(tags: string[], raw: string): string[] {
  const tag = cleanTag(raw);
  if (!tag || tags.length >= MAX_TAGS) return tags;
  if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

// ───────────────────────────── links (stored as-is; no page fetching)

/**
 * A pasted or typed link as a full http(s) URL, or null if it isn't one.
 * "instagram.com/p/abc" → "https://instagram.com/p/abc". Needs a dot in the host.
 */
export function normaliseUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") || url.hostname.startsWith(".") || url.hostname.endsWith("."))
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** True for text that is only a link (what a paste turns into a Link idea). */
export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  return /^(https?:\/\/|www\.)/i.test(t) && normaliseUrl(t) !== null;
}

/** "https://www.tiktok.com/@creator" → "tiktok.com/@creator"; deeper paths end in "/…". */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return host;
    return `${host}/${parts[0]}${parts.length > 1 ? "/…" : ""}`;
  } catch {
    return url;
  }
}

/** Platform from a link's host (instagram.com / tiktok.com), else null. */
export function platformFromUrl(url: string): IdeaPlatform | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  } catch {
    /* not a URL */
  }
  return null;
}

// ───────────────────────────── card footer: who + when

const DAY = 86_400_000;

/**
 * 14b: "TODAY", "YESTERDAY", "2 DAYS AGO", "1 WEEK AGO", "3 WEEKS AGO", then "12 NOV".
 * M09 (short): "TODAY", "1D" … "6D", "1W" … "4W", then "12 NOV".
 */
export function ideaAge(createdAt: string, now: number = Date.now(), short = false): string {
  const ms = Date.parse(createdAt);
  if (Number.isNaN(ms)) return "";
  const days = Math.floor(Math.max(0, now - ms) / DAY);
  if (days === 0) return "TODAY";
  if (days < 7) {
    if (short) return `${days}D`;
    return days === 1 ? "YESTERDAY" : `${days} DAYS AGO`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks <= 4) return short ? `${weeks}W` : `${weeks} WEEK${weeks === 1 ? "" : "S"} AGO`;
  return (formatShortDate(ms, new Date(now)) ?? "").toUpperCase();
}

/** Who saved it: the creator's first name, "BLIP" for AI ideas, "TEAM" if the person was removed. */
export function ideaAuthor(idea: Pick<Idea, "kind" | "creator">): string {
  if (idea.kind === "ai") return "BLIP";
  const first = idea.creator?.full_name?.trim().split(/\s+/)[0];
  return (first || "Team").toUpperCase();
}

const MONTH_NAMES = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

/** Where an AI idea came from: "FROM PLAN JANUARY" (Plan {month}) or "FROM ASK BLIP". */
export function aiSourceLabel(snap: SourceSnapshot | null): string {
  const day = snap?.saved_from === "plan" ? snap.suggested_date : undefined;
  const month =
    day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? MONTH_NAMES[Number(day.slice(5, 7)) - 1] : null;
  return month ? `FROM PLAN ${month}` : "FROM ASK BLIP";
}

/**
 * Plan it's starting day for an AI idea: Blip's suggested date, if it's still today or later.
 * Null otherwise (the person picks a day).
 */
export function suggestedDay(snap: SourceSnapshot | null, today: string): string | null {
  const day = snap?.suggested_date;
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= today ? day : null;
}

/** Main text on a card: the note, else the source post's caption, else nothing. */
export function ideaText(idea: Pick<Idea, "note" | "source_snapshot">): string {
  return idea.note?.trim() || idea.source_snapshot?.caption?.trim() || "";
}

// ───────────────────────────── "Planned · {date}" badge

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A calendar day (YYYY-MM-DD, no time zone) as "Tue 5 Jan" (14b) or "5 Jan" (M09, short).
 * Read in UTC like the calendar, so a time zone can't move it to another day.
 */
export function plannedLabel(day: string, short = false): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return short ? base : `${WEEKDAYS[d.getUTCDay()]} ${base}`;
}

// ───────────────────────────── bento board (14b)

/** Wide when at least 1.2× wider than tall; tall when taller than wide; else square. */
export function imageShape(
  width: number | null,
  height: number | null,
): "wide" | "tall" | "square" | null {
  if (!width || !height) return null;
  const ratio = width / height;
  if (ratio >= 1.2) return "wide";
  if (ratio < 1) return "tall";
  return "square";
}

/** Ideas whose tile shows a picture: screenshots, and posts that kept a thumbnail. */
export function hasPicture(idea: Pick<Idea, "kind" | "image_path">): boolean {
  return (idea.kind === "screenshot" || idea.kind === "post") && !!idea.image_path;
}

/**
 * Columns a tile spans: landscape pictures 2, everything else 1 (portrait, square, unknown size,
 * notes, links, AI ideas). Heights follow the content (the picture at its own ratio), see BentoGrid.
 */
export function tileColumns(
  idea: Pick<Idea, "kind" | "image_path" | "image_width" | "image_height">,
): 1 | 2 {
  return hasPicture(idea) && imageShape(idea.image_width, idea.image_height) === "wide" ? 2 : 1;
}

/** Rows of `unit` px (no row gap) a tile of `height` px needs, keeping `gap` px below it. */
export function rowSpan(height: number, unit: number, gap: number): number {
  return Math.max(1, Math.ceil((height + gap) / unit));
}

// ───────────────────────────── Plan it (14d)

export const CARD_TITLE_MAX = 60;

/**
 * The calendar card's title when an idea is planned: the first line of the note, else the source
 * post's caption, else "Idea". Longer than 60 characters → cut at a word and "…" added. The title
 * can be edited on the card afterwards.
 */
export function ideaCardTitle(idea: Pick<Idea, "note" | "source_snapshot">): string {
  const text = ideaText(idea).split("\n")[0].replace(/\s+/g, " ").trim();
  if (!text) return "Idea";
  if (text.length <= CARD_TITLE_MAX) return text;
  const cut = text.slice(0, CARD_TITLE_MAX - 1);
  // Already at a word's end when the next character is a space; else back up to the last space.
  const atWordEnd = text[CARD_TITLE_MAX - 1] === " ";
  const lastSpace = cut.lastIndexOf(" ");
  const words = atWordEnd || lastSpace <= 30 ? cut : cut.slice(0, lastSpace);
  return `${words.replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** What Plan it says it will make: "an “Idea” card on Tue 12 Jan with this screenshot attached". */
export function planSummary(kind: IdeaKind, day: string | null): string {
  const what: Record<IdeaKind, string> = {
    screenshot: "this screenshot",
    link: "this link",
    note: "this note",
    post: "this post",
    ai: "this idea",
  };
  const when = day ? ` on ${plannedLabel(day)}` : "";
  return `Creates an “Idea” card${when} with ${what[kind]} attached. The idea is marked Planned.`;
}

// ───────────────────────────── who can delete (RLS: creator or admin, *_idea_delete_rules.sql)

/** Same rule as the database: the person who added it, or an admin (AI ideas: admins only). */
export function canDeleteIdea(
  idea: Pick<Idea, "created_by">,
  userId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  return isAdmin || (!!idea.created_by && idea.created_by === userId);
}

/** Why someone else can't delete it: "Only Fatima (who added it) or an admin can delete this idea." */
export function deleteBlockedMessage(idea: Pick<Idea, "kind" | "creator">): string {
  if (idea.kind === "ai") return "Only an admin can delete AI ideas.";
  const first = idea.creator?.full_name?.trim().split(/\s+/)[0];
  return first
    ? `Only ${first} (who added it) or an admin can delete this idea.`
    : "Only the person who added it or an admin can delete this idea.";
}
