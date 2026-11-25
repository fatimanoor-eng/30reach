// Slice 17b: the client lives in the URL (/c/{slug}/…). Pure helpers: paths, which client to open,
// switcher order, "Pulled today" meta and the client mark's colours.
import { differenceInCalendarDays } from "date-fns";

export type ClientSummary = {
  id: string;
  slug: string;
  name: string;
  initials: string | null;
  brand_color: string | null;
  is_demo: boolean;
  archived_at: string | null;
  /** Slice 17c */
  logo_path?: string | null;
  website?: string | null;
  archived_by?: string | null;
  /** Slice 17e: holidays / marketing dates and health months follow the client. */
  country?: string;
  health_months?: boolean;
};

const PREFIX = /^\/c\/([^/?#]+)/;

/** "/calendar?date=…" for client "obu-health" → "/c/obu-health/calendar?date=…". */
export function clientPath(slug: string, path: string): string {
  return `/c/${encodeURIComponent(slug)}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The page part of a pathname: "/c/obu-health/ideas" → "/ideas"; "/ideas" stays "/ideas". */
export function appPathOf(pathname: string): string {
  return pathname.replace(PREFIX, "") || "/";
}

/** The slug in a pathname, if any. */
export function slugOf(pathname: string): string | undefined {
  const m = PREFIX.exec(pathname);
  return m ? decodeURIComponent(m[1]) : undefined;
}

/**
 * Where "/" and old links (/overview, /ideas?idea=…) go (Slice 17b; "Pick a client" since 17h):
 * - `open`: your last client on any device (profiles.last_client_id), else this browser's, if still active;
 * - `pick`: none remembered (first visit), or the remembered one was archived / deleted → the picker.
 *   `archived` = that archived client, so the picker can name it;
 * - `none`: no active client at all → Add client.
 */
export type LastClientChoice<T> =
  { kind: "open"; client: T } | { kind: "pick"; archived: T | null } | { kind: "none" };

export function lastClientChoice<
  T extends Pick<ClientSummary, "id" | "slug" | "name" | "archived_at">,
>(
  clients: readonly T[],
  { profileClientId, storedSlug }: { profileClientId?: string | null; storedSlug?: string | null },
): LastClientChoice<T> {
  const active = clients.filter((c) => !c.archived_at);
  if (active.length === 0) return { kind: "none" };
  const remembered =
    active.find((c) => c.id === profileClientId) ?? active.find((c) => c.slug === storedSlug);
  if (remembered) return { kind: "open", client: remembered };
  const archived =
    clients.find((c) => c.archived_at && c.id === profileClientId) ??
    clients.find((c) => c.archived_at && c.slug === storedSlug) ??
    null;
  return { kind: "pick", archived };
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** Switcher order (15a): the client you're on first (your last opened), then A–Z. Archived left out. */
export function orderClients<T extends Pick<ClientSummary, "id" | "name" | "archived_at">>(
  clients: readonly T[],
  currentId: string | undefined,
): T[] {
  const active = clients.filter((c) => !c.archived_at);
  const current = active.filter((c) => c.id === currentId);
  return [...current, ...active.filter((c) => c.id !== currentId).sort(byName)];
}

/** The switcher's search shows from this many clients (15a annotation). */
export const SEARCH_FROM = 6;

export function filterClients<T extends { name: string }>(
  clients: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : [...clients];
}

/**
 * Row meta (15a / M13): "Pulled today" (the phone sheet says "Today"), "Yesterday", "2 days ago",
 * "No pull yet". Calendar days, in the viewer's time zone.
 */
export function lastPullLabel(
  lastPullAt: string | null | undefined,
  now: Date = new Date(),
  { short = false }: { short?: boolean } = {},
): string {
  if (!lastPullAt) return "No pull yet";
  const days = Math.max(0, differenceInCalendarDays(now, new Date(lastPullAt)));
  if (days === 0) return short ? "Today" : "Pulled today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/** Initials for the client mark: the saved ones, else the first two letters of the first word. */
export function clientInitials(name: string, saved?: string | null): string {
  if (saved?.trim()) return saved.trim().slice(0, 3).toUpperCase();
  return (name.trim().split(/\s+/)[0] ?? "").slice(0, 2).toUpperCase();
}

/** Relative luminance (WCAG) of "#rrggbb". */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export type MarkColors =
  /** No colour, or a black / white brand colour: initials on ink with a hairline (15a annotation). */
  { kind: "ink" } | { kind: "brand"; background: string; text: "ink" | "white" };

export function markColors(brandColor: string | null | undefined): MarkColors {
  if (!brandColor || !/^#[0-9a-f]{6}$/i.test(brandColor)) return { kind: "ink" };
  const l = luminance(brandColor);
  if (l < 0.02 || l > 0.9) return { kind: "ink" };
  // Pick whichever text colour contrasts more (ink ≈ L 0.004).
  const onWhite = 1.05 / (l + 0.05);
  const onInk = (l + 0.05) / 0.054;
  return { kind: "brand", background: brandColor, text: onInk >= onWhite ? "ink" : "white" };
}
