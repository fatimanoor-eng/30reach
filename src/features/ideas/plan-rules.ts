// Rules for the 14d Plan it calendar. Events come from the calendar's automatic sources only
// (Nager.Date holidays, marketing rules, the health list — CALENDAR_EVENTS.md); never from AI.
import { eventsInRange, type HolidayRow } from "../calendar/events";
import { isoDay, lastDayOfMonth, type IsoDay } from "../calendar/events/dates";

/**
 * Days in a month on which an event starts, with the events' names (the yellow dots). An event
 * that started the month before (Resolution season, 26 Dec → 15 Jan) gets no dot. month: 0 = January.
 */
export function eventStarts(
  year: number,
  month: number,
  holidays: ReadonlyMap<number, HolidayRow[]>,
): Map<IsoDay, string[]> {
  const first = isoDay(year, month, 1);
  const last = lastDayOfMonth(year, month);
  const map = new Map<IsoDay, string[]>();
  for (const e of eventsInRange(first, last, holidays)) {
    if (e.start < first || e.start > last) continue;
    map.set(e.start, [...(map.get(e.start) ?? []), e.name]);
  }
  return map;
}
