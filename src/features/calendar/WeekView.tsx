import { useRef } from "react";
import { BlipIdle } from "../../components/blip/BlipPoses";
import { cardMeta, EVENT_BG, PLATFORM_BAR, STATUS_LABEL, type CalendarCard } from "./calendar-ui";
import { AiTag, StatusDot } from "./CardTile";
import { eventsOn } from "./events/bars";
import type { IsoDay } from "./events/dates";
import type { CalendarEvent } from "./events";
import { dayHeading, dayLabel, dayMonth } from "./format";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const SWIPE_PX = 50;

/**
 * M07 (phones): week strip + day list. Swipe the strip for the previous / next week (screen-reader
 * buttons do the same). Dots = events and cards that day. The list shows only days with something
 * on them; a multi-day event appears once, on its first day in the week, as "… · until 15 Jan".
 */
export function WeekView({
  week,
  selected,
  today,
  events,
  cards,
  onSelect,
  onWeek,
  onOpenCard,
}: {
  week: IsoDay[];
  selected: IsoDay;
  today: IsoDay;
  events: CalendarEvent[];
  cards: CalendarCard[];
  onSelect: (day: IsoDay) => void;
  /** -1 = previous week, 1 = next week */
  onWeek: (step: -1 | 1) => void;
  onOpenCard: (id: string) => void;
}) {
  const touch = useRef<{ x: number; y: number } | null>(null);

  const days = week.map((day) => {
    const touching = eventsOn(day, events);
    const listed = touching.filter((e) => (e.start < week[0] ? week[0] : e.start) === day);
    const dayCards = cards.filter((c) => c.date === day);
    const dots = [
      ...new Set([
        ...touching.map((e) => EVENT_BG[e.kind]),
        ...dayCards.map((c) => PLATFORM_BAR[c.platform ?? "none"]),
      ]),
    ].slice(0, 3);
    return { day, listed, cards: dayCards, dots };
  });
  const withItems = days.filter((d) => d.listed.length || d.cards.length);

  const select = (day: IsoDay) => {
    onSelect(day);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(`day-${day}`)
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  };

  return (
    <>
      <div
        className="relative mb-4 flex justify-between rounded-card border border-line bg-surface px-1.5 py-2.5"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) onWeek(dx < 0 ? 1 : -1);
        }}
      >
        <button type="button" className="sr-only" onClick={() => onWeek(-1)}>
          Previous week
        </button>
        {days.map(({ day, dots }, i) => {
          const on = day === selected;
          return (
            <button
              key={day}
              type="button"
              onClick={() => select(day)}
              aria-pressed={on}
              aria-current={day === today ? "date" : undefined}
              aria-label={`${dayLabel(day)}${dots.length ? ", has posts or events" : ""}`}
              className="flex min-w-11 flex-col items-center gap-1"
            >
              <span aria-hidden="true" className="mono-label text-muted">
                {LETTERS[i]}
              </span>
              <span
                aria-hidden="true"
                className={`flex size-9 items-center justify-center rounded-full text-body font-medium ${on ? "bg-ink text-white" : "text-ink"}`}
              >
                {Number(day.slice(8))}
              </span>
              <span aria-hidden="true" className="flex h-[5px] gap-0.5">
                {dots.map((dot) => (
                  <span key={dot} className={`size-[5px] rounded-full ${dot}`} />
                ))}
              </span>
            </button>
          );
        })}
        <button type="button" className="sr-only" onClick={() => onWeek(1)}>
          Next week
        </button>
      </div>

      {withItems.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <BlipIdle className="h-auto w-16" />
          <p className="mono-label text-muted">Nothing planned</p>
          <p className="text-body-sm text-muted">
            No posts or dates this week. Tap + to add a post on {dayMonth(selected)}.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {withItems.map(({ day, listed, cards: dayCards }) => (
            <section
              key={day}
              id={`day-${day}`}
              aria-labelledby={`day-${day}-heading`}
              className="flex scroll-mt-4 flex-col gap-1.5"
            >
              <h2 id={`day-${day}-heading`} className="mono-label text-muted">
                {dayHeading(day)}
              </h2>
              {listed.map((e) => (
                <p
                  key={e.id}
                  className={`rounded-[6px] px-2.5 py-1.5 text-small font-medium ${EVENT_BG[e.kind]}`}
                >
                  {e.name}
                  {e.end > day && ` · until ${dayMonth(e.end)}`}
                </p>
              ))}
              {dayCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onOpenCard(card.id)}
                  className="relative flex min-h-14 w-full items-center gap-2.5 overflow-hidden rounded-tile border border-line bg-surface py-2.5 pr-3 pl-3.5 text-left"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-1 ${PLATFORM_BAR[card.platform ?? "none"]}`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate mono-label text-muted">{cardMeta(card)}</span>
                      {card.origin === "ai" && <AiTag />}
                      {card.origin === "ai" && (
                        <span className="sr-only">Started as an AI idea</span>
                      )}
                    </span>
                    <span className="truncate text-body-sm font-medium">{card.title}</span>
                  </span>
                  <StatusDot status={card.status} size="md" />
                  <span className="sr-only">{STATUS_LABEL[card.status]}</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
