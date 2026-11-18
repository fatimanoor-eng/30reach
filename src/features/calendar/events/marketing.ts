// Marketing dates — calculated in code, never by AI (CALENDAR_EVENTS.md §2). Shown in breeze.
import { isoDay, toIso, type IsoDay } from "./dates";
import { makeEvent, type CalendarEvent } from "./types";

/** weekday: 0 = Sunday … 6 = Saturday; month: 0 = Jan. The nth such weekday of the month (UTC). */
export function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
}

/**
 * Western Easter Sunday, Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 * Valid for every Gregorian year.
 */
export function easterSunday(year: number): IsoDay {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDay(year, month - 1, day);
}

const day = (date: Date, plus = 0) =>
  toIso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + plus)));

/** 4th Thursday of November. Thanksgiving itself comes from Nager.Date; this anchors Black Friday. */
export const thanksgiving = (year: number): IsoDay => day(nthWeekday(year, 10, 4, 4));
export const blackFriday = (year: number): IsoDay => day(nthWeekday(year, 10, 4, 4), 1);
export const smallBusinessSaturday = (year: number): IsoDay => day(nthWeekday(year, 10, 4, 4), 2);
export const cyberMonday = (year: number): IsoDay => day(nthWeekday(year, 10, 4, 4), 4);
export const givingTuesday = (year: number): IsoDay => day(nthWeekday(year, 10, 4, 4), 5);
export const mothersDay = (year: number): IsoDay => day(nthWeekday(year, 4, 0, 2));
export const fathersDay = (year: number): IsoDay => day(nthWeekday(year, 5, 0, 3));
export const backToSchool = (year: number): IsoDay => day(nthWeekday(year, 7, 1, 2));

/**
 * Every marketing date that *starts* in `year`. Resolution season starts on 26 Dec and runs to
 * 15 Jan of the next year, so the one shown in early January belongs to the year before.
 */
export function marketingEvents(year: number): CalendarEvent[] {
  const m = (name: string, start: IsoDay, end?: IsoDay) => makeEvent("marketing", name, start, end);
  return [
    m("Valentine's Day", isoDay(year, 1, 14)),
    m("St Patrick's Day", isoDay(year, 2, 17)),
    m("Easter Sunday", easterSunday(year)),
    m("Mother's Day", mothersDay(year)),
    m("Father's Day", fathersDay(year)),
    m("Back to school", backToSchool(year)),
    m("Halloween", isoDay(year, 9, 31)),
    m("Black Friday", blackFriday(year)),
    m("Small Business Saturday", smallBusinessSaturday(year)),
    m("Cyber Monday", cyberMonday(year)),
    m("Giving Tuesday", givingTuesday(year)),
    m("Christmas Eve", isoDay(year, 11, 24)),
    m("Resolution season", isoDay(year, 11, 26), isoDay(year + 1, 0, 15)),
    m("New Year's Eve", isoDay(year, 11, 31)),
  ];
}
