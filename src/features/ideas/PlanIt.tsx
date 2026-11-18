import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { useToast } from "../../components/toast-context";
import { MQ_TABLET_UP, useMediaQuery } from "../../lib/useMediaQuery";
import type { CardPlatform } from "../calendar/calendar-ui";
import type { IsoDay } from "../calendar/events/dates";
import { formatFor, formatOptions, PLATFORM_OPTIONS } from "../calendar/platform-options";
import { SelectChip } from "../calendar/SelectChip";
import { ideaCardTitle, plannedLabel, planSummary, type Idea } from "./idea-rules";
import { planIdea, PlanError } from "./ideas-api";
import { PlanCalendar } from "./PlanCalendar";

/**
 * 14d "Plan it": pick a day (yellow dots = event days), platform and format → "Create calendar card".
 * The database makes the card (status Idea, linked to the idea) and marks the idea Planned in one
 * go (plan_idea). Tablet/desktop: a popover above the Plan it button. Phones: a bottom sheet.
 * Esc or a click outside closes the popover (not the drawer behind it).
 */
export function PlanIt({
  idea,
  open,
  onClose,
  onPlanned,
}: {
  idea: Idea;
  open: boolean;
  onClose: () => void;
  /** Planned: the detail drawer closes so the toast (and its Open) is reachable. */
  onPlanned: () => void;
}) {
  const tabletUp = useMediaQuery(MQ_TABLET_UP);
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [day, setDay] = useState<IsoDay | null>(null);
  const [platform, setPlatform] = useState<CardPlatform | null>(idea.platform);
  const [formatRequest, setFormatRequest] = useState(0);
  const [format, setFormat] = useState<string | null>(() =>
    formatFor(idea.platform, idea.format ?? idea.source_snapshot?.format),
  );

  const plan = useMutation({
    mutationFn: () =>
      planIdea({ ideaId: idea.id, date: day!, platform, format, title: ideaCardTitle(idea) }),
    onSuccess: (card) => {
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
      onClose();
      onPlanned();
      toast.show({
        title: `Planned for ${plannedLabel(card.date)}`,
        detail: "Added to the calendar as an Idea card.",
        pose: "success",
        action: {
          label: "Open",
          onClick: () => navigate(`/calendar?date=${card.date}&card=${card.id}`),
        },
      });
    },
    // Shown inline: a toast would sit under the drawer (a modal), out of reach.
    onError: (err: Error) => {
      if (err instanceof PlanError && err.reason !== "other")
        void queryClient.invalidateQueries({ queryKey: ["ideas"] });
    },
  });

  const body = (
    <div className="flex flex-col gap-3.5">
      {/* A new calendar each time it opens, so it starts on the chosen day (or today) with focus. */}
      <PlanCalendar key={open ? "open" : "closed"} value={day} onChange={setDay} autoFocus={open} />
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Platform and format"
      >
        <SelectChip
          label="Platform"
          placeholder="Platform"
          value={platform}
          options={PLATFORM_OPTIONS}
          onChange={(p) => {
            const kept = formatFor(p, format);
            setPlatform(p);
            setFormat(kept);
            if (!kept) setFormatRequest((n) => n + 1); // the format menu opens next
          }}
        />
        <SelectChip
          label="Format"
          placeholder="Format"
          value={format}
          options={formatOptions(platform)}
          onChange={setFormat}
          disabled={!platform}
          disabledReason="Choose a platform first"
          openRequest={formatRequest}
        />
      </div>
      <p className="text-small text-muted">{planSummary(idea.kind, day)}</p>
      {plan.isError && (
        <p role="alert" className="text-small text-spark">
          {plan.error instanceof PlanError
            ? plan.error.message
            : "Couldn’t plan it. Check your connection and try again."}
        </p>
      )}
    </div>
  );
  const create = {
    label: plan.isPending ? "Creating…" : "Create calendar card",
    onClick: () => plan.mutate(),
    disabled: !day || plan.isPending,
  };

  if (!tabletUp)
    return (
      <BottomSheet
        open={open}
        onClose={() => !plan.isPending && onClose()}
        title="Plan this idea"
        primary={create}
      >
        {body}
      </BottomSheet>
    );

  return (
    <Popover open={open} onClose={() => !plan.isPending && onClose()} title="Plan this idea">
      {body}
      <Button fullWidth className="mt-3.5" onClick={create.onClick} disabled={create.disabled}>
        {create.label}
      </Button>
    </Popover>
  );
}

/**
 * Small non-modal popover above its anchor (the anchor's wrapper is `relative`). Esc and a click
 * outside close it; Esc stops there, so the drawer behind stays open.
 */
function Popover({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      // The select chips' menus are inside; anything else outside closes the popover, except
      // its own Plan it button (which toggles it).
      const target = e.target as Element;
      if (target.closest?.("[data-plan-anchor]")) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    };
    // Esc closes the popover first, wherever focus is in the drawer (capture phase, before the
    // drawer's own Esc). An open select chip menu inside handles its Esc itself.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if ((e.target as Element).closest?.('[role="listbox"]')) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      className="absolute right-0 bottom-full z-20 mb-2 w-80 rounded-card border border-line bg-surface px-4.5 py-4 shadow-[0_8px_12px_rgb(0_0_0/0.12)]"
    >
      <h3 id={titleId} className="mb-3.5 text-body font-medium">
        {title}
      </h3>
      {children}
    </div>
  );
}
