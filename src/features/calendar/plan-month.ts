// Plan {month} (10) rules. Pure functions, tested in plan-month.test.ts.
// The AI only SUGGESTS. Events come from code rules + Nager (never AI), and picked ideas are saved to
// the idea board (kind 'ai'), never straight onto the calendar (CLAUDE.md rules 5 and 6).

import type { PlanEvent, PlanFacts, PlanSuggestion } from "../../lib/ai/ai-api";
import type { NewIdea } from "../ideas/ideas-api";
import { eventsInRange, type HolidayRow } from "./events";
import { isoDay, lastDayOfMonth, type IsoDay } from "./events/dates";

/** How far ahead Plan {month} works (the plan-month function allows this month … 3 ahead). */
export const PLAN_MONTHS_AHEAD = 3;

/** "2027-01" for the month after the one in focus, and whether it can be planned (+ why not). */
export function planTarget(
  focus: IsoDay,
  today: IsoDay,
): { month: string; first: IsoDay; enabled: boolean; reason: string | null } {
  const first = isoDay(Number(focus.slice(0, 4)), Number(focus.slice(5, 7)), 1); // month index +1
  const month = first.slice(0, 7);
  const diff =
    (Number(month.slice(0, 4)) - Number(today.slice(0, 4))) * 12 +
    (Number(month.slice(5, 7)) - Number(today.slice(5, 7)));
  if (diff < 0) return { month, first, enabled: false, reason: "That month has passed" };
  if (diff > PLAN_MONTHS_AHEAD)
    return {
      month,
      first,
      enabled: false,
      reason: `Blip plans up to ${PLAN_MONTHS_AHEAD} months ahead`,
    };
  return { month, first, enabled: true, reason: null };
}

/**
 * The month's events for the prompt: every kind (toggles only hide them on the grid), one entry per
 * event, dated on its first day inside the month ("Resolution season" from 26 Dec → 1 Jan).
 */
export function planEvents(
  month: string,
  holidays: ReadonlyMap<number, HolidayRow[]>,
): PlanEvent[] {
  const [y, m] = month.split("-").map(Number);
  const from = isoDay(y, m - 1, 1);
  const to = lastDayOfMonth(y, m - 1);
  return eventsInRange(from, to, holidays).map((e) => ({
    date: e.start < from ? from : e.start,
    name: e.name,
    kind: e.kind,
  }));
}

/** The "30reach looked at" chips, from code facts (never the model). */
export function factChips(facts: PlanFacts, monthName: string): string[] {
  return [
    facts.events === 0
      ? `No events in ${monthName}`
      : `${facts.events} ${facts.events === 1 ? "event" : "events"} in ${monthName}`,
    facts.bestFormat && `${facts.bestFormat} win right now`,
    facts.bestTime && `${facts.bestTime} works best`,
    facts.boardIdeas > 0 &&
      `${facts.boardIdeas} ${facts.boardIdeas === 1 ? "idea" : "ideas"} on your board`,
  ].filter((c): c is string => !!c);
}

/** A picked suggestion → an AI idea. Title first (it becomes the card title), then the reason. */
export function ideaFromSuggestion(s: PlanSuggestion): NewIdea {
  const first = s.sources[0];
  return {
    kind: "ai",
    note: `${s.title}\nWhy: ${s.reason}`,
    platform: s.platform,
    format: s.format,
    tags: [],
    source_post_id: first?.id ?? null,
    source_snapshot: {
      saved_from: "plan",
      suggested_date: s.date,
      reason: s.reason,
      ...(first && {
        brand: first.brand,
        date: first.postedAt ?? undefined,
        url: first.url,
        likes: first.likes,
      }),
    },
  };
}
