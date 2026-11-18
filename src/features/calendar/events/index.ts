// All-day events for a date range, from the three automatic sources. No AI, no network here:
// holidays arrive already fetched (by year) from `holiday_cache`.
import type { IsoDay } from "./dates";
import { healthEvents } from "./health";
import { holidayEvents, type HolidayRow } from "./holidays";
import { marketingEvents } from "./marketing";
import type { CalendarEvent, EventKind } from "./types";

export type { CalendarEvent, EventKind } from "./types";
export type { HolidayRow } from "./holidays";

export const EVENT_KINDS: EventKind[] = ["holiday", "health", "marketing"];

/** Years whose holidays a range needs (a December grid spills into January). */
export function yearsIn(from: IsoDay, to: IsoDay): number[] {
  const years: number[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) years.push(y);
  return years;
}

const kindOrder: Record<EventKind, number> = { holiday: 0, marketing: 1, health: 2 };

/**
 * Every event overlapping [from, to], sorted by start, then longer first (so multi-day bars take the
 * top lanes), then holiday → marketing → health. `holidays` maps year → that year's Nager rows; a
 * missing year just has no holidays yet.
 */
export function eventsInRange(
  from: IsoDay,
  to: IsoDay,
  holidays: ReadonlyMap<number, HolidayRow[]>,
): CalendarEvent[] {
  const all: CalendarEvent[] = [];
  // Start a year early: Resolution season (26 Dec → 15 Jan) belongs to the year it starts in.
  const fromYear = Number(from.slice(0, 4)) - 1;
  for (let y = fromYear; y <= Number(to.slice(0, 4)); y++) {
    all.push(...marketingEvents(y), ...healthEvents(y), ...holidayEvents(y, holidays.get(y) ?? []));
  }
  return all
    .filter((e) => e.end >= from && e.start <= to)
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) ||
        b.end.localeCompare(a.end) ||
        kindOrder[a.kind] - kindOrder[b.kind] ||
        a.name.localeCompare(b.name),
    );
}
