// Pure rules for the `holidays` Edge Function (Slice 9, INTEGRATIONS.md §5). Tested in logic.test.ts.

export const COUNTRY = "US";
export const nagerUrl = (year: number) =>
  `https://date.nager.at/api/v3/PublicHolidays/${year}/${COUNTRY}`;

/** Holidays rarely change; re-fetch a cached year after this long (only when someone opens it). */
export const CACHE_MAX_AGE_DAYS = 90;

/** What we keep from each Nager row. The browser applies the display rules (CALENDAR_EVENTS.md §1). */
export type HolidayRow = { date: string; name: string; global: boolean };

/** Body → year, limited to last year … two years ahead so nobody can fill the table with junk. */
export function parseYear(body: Record<string, unknown>, currentYear: number): number | null {
  const year = typeof body.year === "number" ? body.year : Number.NaN;
  if (!Number.isInteger(year)) return null;
  return year >= currentYear - 1 && year <= currentYear + 2 ? year : null;
}

/** Nager response → slim rows, or null if it doesn't look like a holiday list (never cache junk). */
export function slimNager(body: unknown, year: number): HolidayRow[] | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  const rows: HolidayRow[] = [];
  for (const item of body) {
    if (!item || typeof item !== "object") return null;
    const { date, name, global } = item as Record<string, unknown>;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (typeof name !== "string" || !name.trim()) return null;
    // Observed days can fall in the year before (New Year's Day 2022 → 2021-12-31), never further.
    const y = Number(date.slice(0, 4));
    if (y !== year && y !== year - 1) return null;
    rows.push({ date, name: name.trim(), global: global !== false });
  }
  return rows;
}

export function isFresh(fetchedAt: string | null | undefined, now: number): boolean {
  if (!fetchedAt) return false;
  const age = now - new Date(fetchedAt).getTime();
  return Number.isFinite(age) && age < CACHE_MAX_AGE_DAYS * 86_400_000;
}
