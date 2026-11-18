// Calendar wording for days. date-fns formats in local time, so each ISO day becomes local midnight
// of that same day first: the printed day can never shift with the viewer's time zone.
import { format } from "date-fns";
import type { IsoDay } from "./events/dates";

const local = (day: IsoDay) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** "Thursday 24 December" (screen-reader names for days). */
export const dayLabel = (day: IsoDay) => format(local(day), "EEEE d MMMM");
/** "WED 23 DEC" (mobile day list headings; uppercased here so screen readers read the words). */
export const dayHeading = (day: IsoDay) => format(local(day), "EEE d MMM");
/** "Fri 4 Dec" (09 meta line). */
export const shortDay = (day: IsoDay) => format(local(day), "EEE d MMM");
/** "15 Jan" ("· until 15 Jan"). */
export const dayMonth = (day: IsoDay) => format(local(day), "d MMM");
/** "December 2026". */
export const monthYear = (day: IsoDay) => format(local(day), "MMMM yyyy");
/** "December". */
export const monthName = (day: IsoDay) => format(local(day), "MMMM");
