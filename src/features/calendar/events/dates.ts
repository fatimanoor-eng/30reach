// Calendar day helpers. A day is an ISO string "YYYY-MM-DD" (the same shape as Postgres `date`).
// All arithmetic goes through UTC midnight so a time zone can never shift a day (CALENDAR_EVENTS.md).

export type IsoDay = string;

const pad = (n: number) => String(n).padStart(2, "0");

/** month: 0 = January (like Date). */
export function isoDay(year: number, month: number, day: number): IsoDay {
  return toIso(new Date(Date.UTC(year, month, day)));
}

export function toIso(date: Date): IsoDay {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function fromIso(day: IsoDay): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(day: IsoDay, n: number): IsoDay {
  const date = fromIso(day);
  date.setUTCDate(date.getUTCDate() + n);
  return toIso(date);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: IsoDay): number {
  return fromIso(day).getUTCDay();
}

/** Monday of the week that contains `day` (weeks start on Monday, Figma 08 / M07). */
export function startOfWeek(day: IsoDay): IsoDay {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

export function daysBetween(from: IsoDay, to: IsoDay): number {
  return Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86_400_000);
}

export function lastDayOfMonth(year: number, month: number): IsoDay {
  return isoDay(year, month + 1, 0);
}

/** Today in the viewer's own time zone (what "today" means on their screen). */
export function todayIso(now = new Date()): IsoDay {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The 6 × 7 (or 5 × 7) month grid: Monday on or before the 1st → Sunday on or after the last day. */
export function monthGrid(year: number, month: number): IsoDay[][] {
  const first = startOfWeek(isoDay(year, month, 1));
  const last = lastDayOfMonth(year, month);
  const weeks: IsoDay[][] = [];
  for (let start = first; start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}
