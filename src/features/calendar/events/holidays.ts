// US public holidays from Nager.Date (INTEGRATIONS.md §5), as cached in `holiday_cache.data`.
// The cache keeps Nager's own list; everything below runs in the browser so a rule change here
// never needs a re-fetch.
import { isoDay } from "./dates";
import { makeEvent, type CalendarEvent } from "./types";

/** One row of a Nager.Date PublicHolidays response (only the fields we use). */
export type HolidayRow = { date: string; name: string; global?: boolean | null };

/**
 * Fixed-date holidays: Nager gives the *observed* day off (July 4, 2026 is a Saturday → Fri 3 July;
 * New Year's Day 2022 → Fri 31 Dec 2021). For content planning the real date is what matters,
 * so these are moved back to it. Matched by name; anything unmatched keeps Nager's date.
 */
const FIXED_DATE: { match: RegExp; month: number; day: number }[] = [
  { match: /^new year'?s day$/i, month: 0, day: 1 },
  { match: /juneteenth/i, month: 5, day: 19 },
  { match: /^independence day$/i, month: 6, day: 4 },
  { match: /^veterans'? day$/i, month: 10, day: 11 },
  { match: /^christmas day$/i, month: 11, day: 25 },
];

/** Nager uses British spellings for some US holidays; show the US name. */
const US_NAME: Record<string, string> = { "Labour Day": "Labor Day" };

/**
 * Nager rows for `year` → holiday events. Keeps nationwide holidays only (`global: true`; state-only
 * days like Lincoln's Birthday are dropped), moves fixed-date holidays to their real date and
 * removes duplicates (Nager lists some days twice). Names use US spelling ("Labor Day").
 */
export function holidayEvents(year: number, rows: HolidayRow[], country = "US"): CalendarEvent[] {
  const seen = new Set<string>();
  const events: CalendarEvent[] = [];
  for (const row of rows) {
    if (row.global === false || typeof row.date !== "string" || typeof row.name !== "string")
      continue;
    const fixed = FIXED_DATE.find((f) => f.match.test(row.name.trim()));
    const date = fixed ? isoDay(year, fixed.month, fixed.day) : row.date;
    const name = (country === "US" ? US_NAME[row.name.trim()] : undefined) ?? row.name.trim();
    const key = `${date}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(makeEvent("holiday", name, date));
  }
  return events;
}
