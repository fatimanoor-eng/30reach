// Wording for the 09 who/when line: "edited 2 h ago · in 16 days".
import { formatShortDate } from "../../lib/format";
import { daysBetween, type IsoDay } from "./events/dates";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "edited just now" / "5 min ago" / "2 h ago" / "3 days ago", then the date ("edited 12 Nov"). */
export function editedAgo(updatedAt: string, now: number = Date.now()): string {
  const ms = Date.parse(updatedAt);
  if (Number.isNaN(ms)) return "";
  const minutes = Math.floor(Math.max(0, now - ms) / 60_000);
  if (minutes < 1) return "edited just now";
  if (minutes < 60) return `edited ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `edited ${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `edited ${plural(days, "day")} ago`;
  return `edited ${formatShortDate(ms, new Date(now))}`;
}

/** The card's day relative to today: "today", "in 16 days", "3 days ago". */
export function dateRelation(day: IsoDay, today: IsoDay): string {
  const n = daysBetween(today, day);
  if (n === 0) return "today";
  return n > 0 ? `in ${plural(n, "day")}` : `${plural(-n, "day")} ago`;
}

/** 09 who line: "New card · Fatima Noor" while creating; "Fatima Noor · edited 2 h ago" once saved. */
export function whoLine(
  name: string | null,
  saved: { updatedAt: string } | null,
  now: number = Date.now(),
): string {
  if (!saved) return ["New card", name].filter(Boolean).join(" · ");
  return [name, editedAgo(saved.updatedAt, now)].filter(Boolean).join(" · ");
}

/** The amber "This date is in the past" note: a past day on a card that isn't Posted yet. */
export function pastAndNotPosted(day: IsoDay, today: IsoDay, status: string): boolean {
  return daysBetween(today, day) < 0 && status !== "posted";
}
