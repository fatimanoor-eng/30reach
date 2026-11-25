import { ChevronLeft, ChevronRight, Lightbulb, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "../../app/PageHeader";
import { Button } from "../../components/Button";
import { LoadError } from "../../components/LoadError";
import { Bone, Skeleton } from "../../components/Skeleton";
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
import { DayListDialog } from "./DayListDialog";
import { CalendarDnd } from "./CalendarDnd";
import { formatFor } from "./platform-options";
import { ideaCardTitle, plannedLabel, type Idea } from "../ideas/idea-rules";
import { planIdea, useIdeas } from "../ideas/ideas-api";
import { useEventRules } from "./useEventRules";
import { useHolidays } from "./useHolidays";
import { WeekView } from "./WeekView";
import { PlanMonthPanel } from "./PlanMonthPanel";
import { planTarget } from "./plan-month";

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
  const rules = useEventRules();
  const events = eventsInRange(from, to, holidays.byYear, rules).filter((e) => toggles[e.kind]);
  // ── ideas: the 08 panel lists them; dropping one on a day plans it (plan_idea, like Plan it)
  const queryClient = useQueryClient();
  const ideas = useIdeas();
  const planDrop = useMutation({
    mutationFn: ({ idea, day }: { idea: Idea; day: IsoDay }) =>
      planIdea({
        ideaId: idea.id,
        date: day,
        platform: idea.platform,
        format: formatFor(idea.platform, idea.format ?? idea.source_snapshot?.format),
        title: ideaCardTitle(idea),
      }),
    onSuccess: (card) => {
      void queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.show({
        title: `Planned for ${plannedLabel(card.date)}`,
        detail: "Added to the calendar as an Idea card.",
        pose: "success",
        action: { label: "Open", onClick: () => openCard(card.id) },
      });
    },
    onError: (err: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.show({ title: err.message, pose: "error" });
    },
  });

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
  // Arrows and swipes step from the day in the *live* URL, not from this render: two quick clicks
  // before React re-renders would otherwise both land on the same month.
  const step = (next: (current: IsoDay) => IsoDay) => {
    const live = new URLSearchParams(window.location.search).get("date");
    goTo(next(isIsoDay(live) ? live : today));
  };
  const monthStep = (by: number) => (d: IsoDay) =>
    isoDay(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1 + by, 1);
  const openCard = (id: string) => update({ card: id, new: null });
  const addPost = (day: IsoDay) => update({ new: day, card: null });
  // "+N more" in a month cell: that day's full list.
  const [dayList, setDayList] = useState<IsoDay | null>(null);
  // The card just closed here: after a delete or "Move to idea board" the list can refresh before
  // the URL drops ?card=, which isn't a "missing" card.
  const [closedId, setClosedId] = useState<string | null>(null);
  const closePanel = () => {
    setClosedId(params.get("card"));
    update({ card: null, new: null }, true);
  };

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
  // Keep the snapshot current: a card saved and reopened must show what was saved. The snapshot
  // itself stays after closing so the drawer can slide out, but reopening the SAME card used to reuse
  // the copy from the first open (old caption, hook, visual idea) — and a second Save would have
  // written those old values back.
  const freshCard = !!panelKey && !panelKey.startsWith("new:") && panelCard !== panel?.card;
  if (panelKey && (panelKey !== panel?.key || freshCard)) {
    setPanel({
      key: panelKey,
      card: panelKey.startsWith("new:") ? null : panelCard,
      date: isIsoDay(newParam) ? newParam : today,
    });
  }
  const missingCard = !!cardId && cardId !== closedId && fetched.isSuccess && fetched.data === null;
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
  // 10 Plan {month}: the month after the one in focus, from this month up to 3 ahead.
  const target = planTarget(focus, today);
  const [planOpen, setPlanOpen] = useState(false);

  const planButton = (mobile: boolean) => (
    <Tooltip content={target.reason} enabled={!target.enabled} side="bottom" className="shrink-0">
      {(tip) => {
        const props = target.enabled
          ? { onClick: () => setPlanOpen(true) }
          : {
              "aria-disabled": true as const,
              "aria-describedby": tip["aria-describedby"],
              onClick: tip.onToggle,
            };
        return mobile ? (
          <button
            type="button"
            {...props}
            className={`inline-flex min-h-11 shrink-0 items-center ${target.enabled ? "" : "cursor-not-allowed"}`}
          >
            <span
              className={`rounded-full bg-ink px-2.5 py-[5px] text-small font-medium text-white ${target.enabled ? "" : "opacity-40"}`}
            >
              {planLabel}
            </span>
          </button>
        ) : (
          <Button
            {...props}
            icon={<Lightbulb size={16} aria-hidden="true" />}
            className={target.enabled ? "" : "cursor-not-allowed opacity-40"}
          >
            {planLabel}
          </Button>
        );
      }}
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
            onClick={() => step(monthStep(-1))}
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-soft"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Next month, ${monthYear(nextMonthFirst)}`}
            onClick={() => step(monthStep(1))}
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-soft"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => goTo(today)}
            disabled={onTodaysMonth}
            title={onTodaysMonth ? "Already showing this month" : undefined}
            className="ml-1 inline-flex h-8 items-center rounded-control border border-line bg-surface px-3 text-small font-medium hover:bg-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface"
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
      <LoadError
        title="The calendar didn’t load"
        onRetry={() => void Promise.all([cards.refetch(), client.refetch()])}
      />
    );
  } else if (!cards.data || !client.data) {
    body = <CalendarSkeleton month={tabletUp} />;
  } else if (tabletUp) {
    body = (
      <CalendarDnd
        cards={cards.data}
        ideas={ideas.data ?? []}
        onMoveCard={(id, date) => move.mutate({ id, date })}
        onPlanIdea={(idea, day) => planDrop.mutate({ idea, day })}
      >
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
              onShowDay={setDayList}
            />
          </div>
          <IdeaPanel
            ideas={ideas.data ?? []}
            loading={ideas.isPending}
            error={ideas.isError}
            onRetry={() => void ideas.refetch()}
          />
        </div>
      </CalendarDnd>
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
        onWeek={(by) => step((d) => addDays(d, by * 7))}
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
      <ModalPresence open={!!dayList}>
        {dayList && (
          <DayListDialog
            day={dayList}
            cards={(cards.data ?? []).filter((c) => c.date === dayList)}
            onClose={() => setDayList(null)}
            onOpenCard={openCard}
            onAddPost={addPost}
          />
        )}
      </ModalPresence>
      <ModalPresence open={planOpen}>
        {client.data && target.enabled && (
          <PlanMonthPanel
            key={target.month}
            open
            onClose={() => setPlanOpen(false)}
            clientId={client.data.id}
            month={target.month}
            monthName={monthName(target.first)}
            year={Number(target.month.slice(0, 4))}
          />
        )}
      </ModalPresence>
    </>
  );
}

/**
 * Loading, in the real shape: 08 month grid (weekday row, 5 weeks of day cells, a few cards) with
 * the idea panel (beside it on desktop, under it on tablet); M07 week strip + day list on phones.
 */
function CalendarSkeleton({ month }: { month: boolean }) {
  if (!month)
    return (
      <Skeleton label="Loading the calendar">
        <div className="mb-5 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <Bone className="h-2.5 w-3" />
              <Bone className="size-9 rounded-full" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3.5">
          {[2, 1, 2].map((n, d) => (
            <div key={d} className="flex flex-col gap-1.5">
              <Bone className="h-3 w-24" />
              {Array.from({ length: n }, (_, i) => (
                <Bone key={i} className="h-14 rounded-tile" />
              ))}
            </div>
          ))}
        </div>
      </Skeleton>
    );
  // Cells that get a card bone, by week × weekday: a plausible spread, never more than one a day.
  const busy = new Set(["0-1", "0-3", "1-2", "1-4", "2-0", "2-3", "3-2", "4-1", "4-2"]);
  return (
    <Skeleton label="Loading the calendar" className="flex flex-col gap-4 xl:flex-row">
      <div className="min-w-0 flex-1 overflow-hidden rounded-card border border-line bg-surface">
        <div className="grid grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="py-2.5 pl-2.5">
              <Bone className="h-2.5 w-7" />
            </div>
          ))}
        </div>
        {Array.from({ length: 5 }, (_, w) => (
          <div key={w} className="grid grid-cols-7 border-t border-line">
            {Array.from({ length: 7 }, (_, d) => (
              <div
                key={d}
                className={`flex min-h-28 flex-col gap-2 px-1.5 pt-2 xl:min-h-32 ${d ? "border-l border-line" : ""}`}
              >
                <Bone className="h-3 w-4" />
                {busy.has(`${w}-${d}`) && <Bone className="h-10 rounded-[6px]" />}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 xl:w-70 xl:shrink-0">
        <Bone className="h-5 w-28" />
        <Bone className="h-3 w-44" />
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-18 rounded-tile" />
        ))}
      </div>
    </Skeleton>
  );
}
