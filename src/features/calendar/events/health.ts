// Health moments — a fixed list, reviewed once a year (CALENDAR_EVENTS.md §3). Shown in bloom.
import { isoDay, lastDayOfMonth } from "./dates";
import { makeEvent, type CalendarEvent } from "./types";

type HealthMoment = { name: string; month: number; day?: number }; // no day = the whole month

/** month: 0 = January. */
export const HEALTH_MOMENTS: HealthMoment[] = [
  { name: "Dry January", month: 0 },
  { name: "American Heart Month", month: 1 },
  { name: "World Obesity Day", month: 2, day: 4 },
  { name: "National Nutrition Month", month: 2 },
  { name: "World Health Day", month: 3, day: 7 },
  { name: "Mental Health Awareness Month", month: 4 },
  { name: "Men's Health Month", month: 5 },
  { name: "World Mental Health Day", month: 9, day: 10 },
  { name: "Breast Cancer Awareness Month", month: 9 },
  { name: "American Diabetes Month", month: 10 },
  { name: "World Diabetes Day", month: 10, day: 14 },
];

export function healthEvents(year: number): CalendarEvent[] {
  return HEALTH_MOMENTS.map(({ name, month, day }) =>
    day
      ? makeEvent("health", name, isoDay(year, month, day))
      : makeEvent("health", name, isoDay(year, month, 1), lastDayOfMonth(year, month)),
  );
}
