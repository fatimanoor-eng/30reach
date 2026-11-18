// Lays all-day events out as bars inside one week row of the month grid.
// A multi-day event becomes one connected bar per week it touches; each bar sits in a lane (row)
// so bars never overlap. The name is printed once: on the first bar visible in the grid (Figma 08:
// the Resolution season bars after the first are unlabelled).
import type { IsoDay } from "./dates";
import type { CalendarEvent } from "./types";

export type WeekBar = {
  event: CalendarEvent;
  /** 0 = Monday … 6 = Sunday, inclusive. */
  startCol: number;
  endCol: number;
  lane: number;
  /** The event carries on from the previous week / into the next week. */
  continuesBefore: boolean;
  continuesAfter: boolean;
  showLabel: boolean;
};

/**
 * `week` = 7 days, Monday first. `gridStart` = first day of the whole grid (for "first visible bar").
 * `events` must already be sorted (eventsInRange does that), so long bars claim the top lanes.
 */
export function layoutWeek(week: IsoDay[], events: CalendarEvent[], gridStart: IsoDay): WeekBar[] {
  const first = week[0];
  const last = week[6];
  const lanes: number[][] = []; // lanes[n] = occupied columns
  const bars: WeekBar[] = [];
  for (const event of events) {
    if (event.end < first || event.start > last) continue;
    const startCol = event.start <= first ? 0 : week.indexOf(event.start);
    const endCol = event.end >= last ? 6 : week.indexOf(event.end);
    let lane = lanes.findIndex((cols) => cols.every((c) => c < startCol || c > endCol));
    if (lane === -1) lane = lanes.push([]) - 1;
    for (let c = startCol; c <= endCol; c++) lanes[lane].push(c);
    const visibleStart = event.start < gridStart ? gridStart : event.start;
    bars.push({
      event,
      startCol,
      endCol,
      lane,
      continuesBefore: event.start < first,
      continuesAfter: event.end > last,
      showLabel: visibleStart >= first && visibleStart <= last,
    });
  }
  return bars;
}

/** Events touching one day (mobile day list and week-strip dots). */
export function eventsOn(day: IsoDay, events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => e.start <= day && e.end >= day);
}
