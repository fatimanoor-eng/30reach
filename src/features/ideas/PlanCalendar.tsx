import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  fromIso,
  isoDay,
  monthGrid,
  todayIso,
  type IsoDay,
} from "../calendar/events/dates";
import { dayLabel, monthYear } from "../calendar/format";
import { useHolidays } from "../calendar/useHolidays";
import { eventStarts } from "./plan-rules";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * 14d mini calendar: month title with ‹ ›, Monday-first grid, the chosen day in ink, and a yellow
 * dot on days an event starts (holidays, marketing dates, health moments; never AI). Days before
 * today can't be picked. Keyboard: one day is tabbable; ← → ↑ ↓ move by a day / week (into the next
 * month when needed), Home / End go to the week's start / end, Enter or Space picks.
 */
export function PlanCalendar({
  value,
  onChange,
  autoFocus = false,
}: {
  value: IsoDay | null;
  onChange: (day: IsoDay) => void;
  autoFocus?: boolean;
}) {
  const today = todayIso();
  const [focus, setFocus] = useState<IsoDay>(value ?? today);
  const shown = fromIso(focus);
  const year = shown.getUTCFullYear();
  const month = shown.getUTCMonth();
  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const holidays = useHolidays([year]);
  const starts = useMemo(
    () => eventStarts(year, month, holidays.byYear),
    [year, month, holidays.byYear],
  );
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(autoFocus);

  // Keep keyboard focus on the focused day after it moves (and on open, when asked).
  // (A frame later: a bottom sheet opening around it takes focus first, M10-style sheets.)
  useEffect(() => {
    if (!moved.current) return;
    const frame = requestAnimationFrame(() => {
      moved.current = false; // only once focus has really moved (effects can run twice in dev)
      grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  const go = (day: IsoDay) => {
    moved.current = true;
    setFocus(day < today ? today : day);
  };
  const stepMonth = (by: number) => {
    const target = new Date(Date.UTC(year, month + by, 1));
    const day = isoDay(target.getUTCFullYear(), target.getUTCMonth(), 1);
    setFocus(day < today ? today : day);
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const weekday = (fromIso(focus).getUTCDay() + 6) % 7; // Monday = 0
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekday,
      End: 6 - weekday,
    };
    if (e.key in moves) {
      e.preventDefault();
      go(addDays(focus, moves[e.key]));
    }
  }

  const isCurrentMonth =
    year === fromIso(today).getUTCFullYear() && month === fromIso(today).getUTCMonth();

  return (
    <div>
      <div className="flex items-center justify-between">
        <p aria-live="polite" className="text-small font-medium">
          {monthYear(isoDay(year, month, 1))}
        </p>
        <div className="flex">
          <button
            type="button"
            aria-label="Previous month"
            disabled={isCurrentMonth}
            onClick={() => stepMonth(-1)}
            className="inline-flex size-11 items-center justify-center rounded-control text-muted hover:text-ink disabled:opacity-30 md:size-7"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => stepMonth(1)}
            className="inline-flex size-11 items-center justify-center rounded-control text-muted hover:text-ink md:size-7"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={grid}
        role="group"
        aria-label="Day"
        onKeyDown={onKeyDown}
        className="mt-2 grid grid-cols-7 gap-0.5"
      >
        {WEEKDAYS.map((d, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="pb-1 text-center font-mono text-label text-muted"
          >
            {d}
          </span>
        ))}
        {weeks.flat().map((day) => {
          const inMonth = fromIso(day).getUTCMonth() === month;
          if (!inMonth) return <span key={day} aria-hidden="true" />;
          const past = day < today;
          const on = day === value;
          const events = starts.get(day);
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              tabIndex={day === focus ? 0 : -1}
              disabled={past}
              aria-pressed={on}
              aria-label={[dayLabel(day), day === today ? "today" : null, ...(events ?? [])]
                .filter(Boolean)
                .join(", ")}
              onClick={() => {
                setFocus(day);
                onChange(day);
              }}
              className={`relative flex h-11 items-center justify-center rounded-[6px] text-small md:h-7 ${
                on
                  ? "bg-ink text-white"
                  : past
                    ? "text-muted opacity-40"
                    : `hover:bg-bg ${day === today ? "font-medium underline underline-offset-2" : ""}`
              }`}
            >
              {Number(day.slice(8))}
              {events && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-flash md:bottom-0.5"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
