import type { IsoDay } from "./dates";

/** Holidays = Nager.Date (flash), health = fixed list (bloom), marketing = code rules (breeze). */
export type EventKind = "holiday" | "health" | "marketing";

/** An all-day event. `end` is inclusive; a one-day event has start === end. */
export type CalendarEvent = {
  id: string;
  kind: EventKind;
  name: string;
  start: IsoDay;
  end: IsoDay;
};

export function makeEvent(
  kind: EventKind,
  name: string,
  start: IsoDay,
  end = start,
): CalendarEvent {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return { id: `${kind}:${start}:${slug}`, kind, name, start, end };
}
