import { ChevronLeft, ChevronRight, Lightbulb, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "../../app/PageHeader";
import { BlipIdle } from "../../components/blip/BlipPoses";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ModalPresence } from "../../components/ModalPresence";
import { useToast } from "../../components/toast-context";
import { Tooltip } from "../../components/Tooltip";
import { useClient } from "../../lib/useClient";
import { MQ_TABLET_UP, useMediaQuery } from "../../lib/useMediaQuery";
import type { CalendarCard } from "./calendar-ui";
import { CalendarLegend } from "./CalendarLegend";
import { CardPanel } from "./CardPanel";
import { cardsKey, useCalendarCard, useCalendarCards, useMoveCard } from "./cards-api";
import { useEventToggles } from "./event-toggles";
import { EventToggles } from "./EventToggles";
import { eventsInRange, yearsIn } from "./events";
import { addDays, isoDay, monthGrid, startOfWeek, todayIso, type IsoDay } from "./events/dates";
import { dayMonth, monthName, monthYear } from "./format";
import { IdeaPanel } from "./IdeaPanel";
import { MonthGrid } from "./MonthGrid";
import { useHolidays } from "./useHolidays";
import { WeekView } from "./WeekView";

const COMING_SOON = "Coming soon";
const isIsoDay = (v: string | null): v is IsoDay =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/**
 * 08 Calendar (month grid from 768 px) and M07 (week strip + day list on phones). Planning only:
 * nothing is ever posted. URL: `?date=` = the day in focus (its month / week is shown),
 * `?card=<id>` = 09 open on a card, `?new=<date>` = 09 for a new post.
 */
export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const tabletUp = useMediaQuery(MQ_TABLET_UP);
  const client = useClient();
  const toast = useToast();
  const today = todayIso();
  const dateParam = params.get("date");
  const focus = isIsoDay(dateParam) ? dateParam : today;
  const year = Number(focus.slice(0, 4));
  const month = Number(focus.slice(5, 7)) - 1;

  const weeks = monthGrid(year, month);
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][6];
  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(focus), i));

  const cards = useCalendarCards(from, to);
  const holidays = useHolidays(yearsIn(from, to));
  const { toggles, toggle } = useEventToggles();
  const events = eventsInRange(from, to, holidays.byYear).filter((e) => toggles[e.kind]);
  const move = useMoveCard(cardsKey(client.data?.id, from, to), () =>
    toast.show({
      title: "Couldn’t move the card",
      detail: "It’s back on its old day. Check your connection and try again.",
      pose: "error",
    }),
  );

  // ── URL helpers (keep the day in focus when the panel opens / closes)
  const update = (next: Record<string, string | null>, replace = false) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace });
  };
  const goTo = (day: IsoDay) => update({ date: day === today ? null : day }, true);
  const openCard = (id: string) => update({ card: id, new: null });
  const addPost = (day: IsoDay) => update({ new: day, card: null });
  const closePanel = () => update({ card: null, new: null }, true);

  // ── the 09 panel: a card from the list, or fetched by id (a link to another month)
  const cardId = params.get("card");
  const newParam = params.get("new");
  const listed = cardId ? (cards.data?.find((c) => c.id === cardId) ?? null) : null;
  const fetched = useCalendarCard(cardId && cards.data && !listed ? cardId : null);
  const panelCard: CalendarCard | null = listed ?? fetched.data ?? null;
  const panelKey = isIsoDay(newParam) ? `new:${newParam}` : panelCard ? panelCard.id : null;
  const [panel, setPanel] = useState<{
    key: string;
    card: CalendarCard | null;
    date: IsoDay;
  } | null>(null);
  if (panelKey && panelKey !== panel?.key) {
    setPanel({
      key: panelKey,
      card: panelKey.startsWith("new:") ? null : panelCard,
      date: isIsoDay(newParam) ? newParam : today,
    });
  }
  const missingCard = !!cardId && fetched.isSuccess && fetched.data === null;
  useEffect(() => {
    if (!missingCard) return;
    toast.show({ title: "That card isn’t on the calendar any more", pose: "idle" });
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete("card");
        return next;
      },
      { replace: true },
    );
  }, [missingCard, toast, setParams]);

  const nextMonthFirst = isoDay(year, month + 1, 1);
  const onTodaysMonth = focus.slice(0, 7) === today.slice(0, 7);
  const planLabel = `Plan ${monthName(nextMonthFirst)}`;

  const planButton = (mobile: boolean) => (
    <Tooltip content={COMING_SOON} side="bottom" className="shrink-0">
      {(tip) =>
        mobile ? (
          <button
            type="button"
            aria-disabled="true"
            aria-describedby={tip["aria-describedby"]}
            onClick={tip.onToggle}
            className="inline-flex min-h-11 shrink-0 cursor-not-allowed items-center"
          >
            <span className="rounded-full bg-ink px-2.5 py-[5px] text-small font-medium text-white opacity-40">
              {planLabel}
            </span>
          </button>
        ) : (
          <Button
            aria-disabled="true"
            aria-describedby={tip["aria-describedby"]}
            onClick={tip.onToggle}
            icon={<Lightbulb size={16} aria-hidden="true" />}
            className="cursor-not-allowed opacity-40"
          >
            {planLabel}
          </Button>
        )
      }
    </Tooltip>
  );

  const header = tabletUp ? (
    <PageHeader
      title={monthYear(focus)}
      crumbs={["Calendar"]}
      titleLeading={
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`Previous month, ${monthYear(isoDay(year, month - 1, 1))}`}
            onClick={() => goTo(isoDay(year, month - 1, 1))}
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-soft"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Next month, ${monthYear(nextMonthFirst)}`}
            onClick={() => goTo(nextMonthFirst)}
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-soft"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => goTo(today)}
            disabled={onTodaysMonth}
            title={onTodaysMonth ? "Already showing this month" : undefined}
            className="ml-1 inline-flex h-8 items-center rounded-control border border-line bg-surface px-3 text-small font-medium hover:bg-soft disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface"
          >
            Today
          </button>
        </div>
      }
      actions={
        <>
          <Button
            variant="secondary"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => addPost(today)}
          >
            New post
          </Button>
          {planButton(false)}
        </>
      }
    />
  ) : (
    <header className="mb-3.5 flex items-center justify-between gap-3">
      <div>
        <h1 className="text-title">{monthName(focus)}</h1>
        <p className="mt-0.5 font-mono text-small text-muted">Week of {dayMonth(week[0])}</p>
      </div>
      <button
        type="button"
        aria-label={`New post on ${dayMonth(focus)}`}
        onClick={() => addPost(focus)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white"
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </header>
  );

  const holidaysNote = toggles.holiday && holidays.failedYears.length > 0 && (
    <p className="mb-3 text-small text-muted">
      Holidays for {holidays.failedYears.join(" and ")} didn’t load. The other dates are shown.{" "}
      <button
        type="button"
        onClick={holidays.retry}
        className="min-h-11 text-blue hover:underline md:min-h-0"
      >
        Try again
      </button>
    </p>
  );

  let body;
  if (cards.isError || client.isError) {
    body = (
      <Card>
        <EmptyState
          label="Couldn’t load"
          title="The calendar didn’t load"
          text="Check your connection and try again. Nothing was changed."
          actions={
            <Button
              variant="secondary"
              onClick={() => void Promise.all([cards.refetch(), client.refetch()])}
            >
              Try again
            </Button>
          }
        />
      </Card>
    );
  } else if (!cards.data || !client.data) {
    body = (
      <div
        aria-busy="true"
        aria-label="Loading the calendar"
        className="flex h-96 items-center justify-center rounded-card bg-soft motion-safe:animate-pulse"
      >
        <BlipIdle className="h-auto w-16 opacity-60" />
      </div>
    );
  } else if (tabletUp) {
    body = (
      <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
        <div className="min-w-0 flex-1">
          <MonthGrid
            weeks={weeks}
            month={month}
            today={today}
            events={events}
            cards={cards.data}
            onOpenCard={openCard}
            onAddPost={addPost}
            onMove={(id, date) => move.mutate({ id, date })}
          />
        </div>
        <IdeaPanel />
      </div>
    );
  } else {
    body = (
      <WeekView
        week={week}
        selected={focus}
        today={today}
        events={events}
        cards={cards.data}
        onSelect={goTo}
        onWeek={(step) => goTo(addDays(focus, step * 7))}
        onOpenCard={openCard}
      />
    );
  }

  return (
    <>
      {header}
      {tabletUp ? (
        <CalendarLegend toggles={toggles} onToggle={toggle} />
      ) : (
        <div
          role="group"
          aria-label="Show events"
          className="-mx-4 mb-2 flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto px-4"
        >
          <EventToggles toggles={toggles} onToggle={toggle} />
          {planButton(true)}
        </div>
      )}
      {holidaysNote}
      {body}

      <ModalPresence open={!!panelKey}>
        {panel && client.data && (
          <CardPanel
            key={panel.key}
            open
            onClose={closePanel}
            card={panel.card}
            newDate={panel.date}
            clientId={client.data.id}
          />
        )}
      </ModalPresence>
    </>
  );
}
