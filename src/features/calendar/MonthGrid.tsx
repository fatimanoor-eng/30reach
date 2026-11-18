import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { EVENT_BG, type CalendarCard } from "./calendar-ui";
import { CardTile } from "./CardTile";
import { layoutWeek, eventsOn, type WeekBar } from "./events/bars";
import { fromIso, type IsoDay } from "./events/dates";
import type { CalendarEvent } from "./events";
import { dayLabel } from "./format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Geometry shared by the day cells and the bar layer (px): cell padding-top 6, day number 16, gap 4,
// bar 19 + gap 4 per lane.
const BARS_TOP = 26;
const LANE = 23;

/**
 * 08 month grid (tablet and desktop). Weeks start on Monday. All-day bars are drawn in one layer per
 * week so multi-day bars connect; each day cell keeps space for them, then lists its cards.
 * Cards drag to another day, and ideas from the panel drop onto a day (CalendarDnd, around the grid
 * and the panel); a click opens 09.
 * Hovering an empty day shows "+ Add post".
 */
export function MonthGrid({
  weeks,
  month,
  today,
  events,
  cards,
  onOpenCard,
  onAddPost,
}: {
  weeks: IsoDay[][];
  /** 0 = January: days outside it are greyed */
  month: number;
  today: IsoDay;
  events: CalendarEvent[];
  cards: CalendarCard[];
  onOpenCard: (id: string) => void;
  onAddPost: (day: IsoDay) => void;
}) {
  const gridStart = weeks[0][0];

  return (
    <>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div aria-hidden="true" className="grid grid-cols-7">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 pl-2.5 mono-label text-muted">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week) => {
          const bars = layoutWeek(week, events, gridStart);
          const lanes = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);
          return (
            <div key={week[0]} className="relative grid grid-cols-7 border-t border-line">
              {week.map((day, i) => (
                <DayCell
                  key={day}
                  day={day}
                  first={i === 0}
                  outside={fromIso(day).getUTCMonth() !== month}
                  today={day === today}
                  lanes={lanes}
                  events={eventsOn(day, events)}
                  cards={cards.filter((c) => c.date === day)}
                  onOpenCard={onOpenCard}
                  onAddPost={onAddPost}
                />
              ))}
              {bars.map((bar) => (
                <Bar key={bar.event.id} bar={bar} />
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** One all-day bar segment inside a week row. Decorative: each day cell lists its events for screen readers. */
function Bar({ bar }: { bar: WeekBar }) {
  const span = bar.endCol - bar.startCol + 1;
  const left = `calc(${(bar.startCol / 7) * 100}% + ${bar.continuesBefore ? 0 : 4}px)`;
  const width = `calc(${(span / 7) * 100}% - ${(bar.continuesBefore ? 0 : 4) + (bar.continuesAfter ? 0 : 4)}px)`;
  return (
    <div
      aria-hidden="true"
      style={{ top: BARS_TOP + bar.lane * LANE, left, width }}
      className={`pointer-events-none absolute flex h-[19px] items-center px-1.5 ${EVENT_BG[bar.event.kind]} ${bar.continuesBefore ? "" : "rounded-l-[4px]"} ${bar.continuesAfter ? "" : "rounded-r-[4px]"}`}
    >
      {bar.showLabel && (
        <span className="truncate text-label leading-[13px] font-medium tracking-normal">
          {bar.event.name}
        </span>
      )}
    </div>
  );
}

function DayCell({
  day,
  first,
  outside,
  today,
  lanes,
  events,
  cards,
  onOpenCard,
  onAddPost,
}: {
  day: IsoDay;
  first: boolean;
  outside: boolean;
  today: boolean;
  lanes: number;
  events: CalendarEvent[];
  cards: CalendarCard[];
  onOpenCard: (id: string) => void;
  onAddPost: (day: IsoDay) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  const label = dayLabel(day);
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={label}
      className={`group flex min-h-28 min-w-0 flex-col gap-1 px-1 pt-1.5 pb-2 xl:min-h-32 ${first ? "" : "border-l border-line"} ${isOver ? "bg-soft" : outside ? "bg-bg/60" : ""}`}
    >
      <span
        aria-current={today ? "date" : undefined}
        className={`h-4 px-1 font-mono text-small leading-4 ${outside ? "text-muted" : "text-ink"}`}
      >
        {Number(day.slice(8))}
      </span>
      {lanes > 0 && <div aria-hidden="true" style={{ height: lanes * LANE - 4 }} />}
      {events.length > 0 && <span className="sr-only">{events.map((e) => e.name).join(", ")}</span>}
      {cards.map((card) => (
        <DraggableCard key={card.id} card={card} onOpen={onOpenCard} />
      ))}
      {cards.length === 0 && (
        <button
          type="button"
          onClick={() => onAddPost(day)}
          aria-label={`Add post on ${label}`}
          className="flex w-full items-center gap-1 rounded-[6px] border border-dashed border-muted/50 bg-bg py-1 pr-2 pl-1.5 text-label font-medium tracking-normal opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Plus size={12} aria-hidden="true" />
          Add post
        </button>
      )}
    </div>
  );
}

function DraggableCard({ card, onOpen }: { card: CalendarCard; onOpen: (id: string) => void }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: card.id });
  return (
    <CardTile
      ref={setNodeRef}
      card={card}
      {...listeners}
      onClick={() => onOpen(card.id)}
      className={isDragging ? "opacity-40" : ""}
    />
  );
}
