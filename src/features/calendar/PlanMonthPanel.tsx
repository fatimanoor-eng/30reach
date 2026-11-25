import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "../../components/Checkbox";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BlipError, BlipIdle, BlipScanning } from "../../components/blip/BlipPoses";
import { Button } from "../../components/Button";
import { Drawer } from "../../components/Drawer";
import { useToast } from "../../components/toast-context";
import { AI_COPY, AiError, planMonth, type PlanSuggestion } from "../../lib/ai/ai-api";
import { createIdea, planIdea } from "../ideas/ideas-api";
import { plannedLabel } from "../ideas/idea-rules";
import { formatName, PLATFORM_BAR, PLATFORM_SHORT } from "./calendar-ui";
import { shortDay } from "./format";
import {
  factChips,
  ideaFromSuggestion,
  PLAN_LINE_MS,
  planEvents,
  planLoadingLines,
} from "./plan-month";
import { useEventRules } from "./useEventRules";
import { useHolidays } from "./useHolidays";
import { useClientPath } from "../../lib/useClient";

/**
 * 10 Plan {month}: Blip suggests ~6 dated post ideas with reasons. The team ticks some and either
 * adds them to the IDEA BOARD (kind 'ai'), or, by pressing "Add to calendar as Ideas", plans them on
 * Blip's suggested days as Idea cards (origin 'ai', via the board + plan_idea, so each keeps its idea).
 * AI ideas only reach the calendar by a person's explicit action (CLAUDE.md rule 6).
 * Drawer from 768 px (600 px wide), full screen on phones. One Groq request per open (kept for the
 * session); "Regenerate" asks again. Loading: Blip/Scanning with rotating lines.
 */
export function PlanMonthPanel({
  open,
  onClose,
  clientId,
  month,
  monthName,
  year,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  /** "2027-01" */
  month: string;
  /** "January" */
  monthName: string;
  year: number;
}) {
  const [round, setRound] = useState(0);
  // Events need that year's holidays first (or the knowledge that they failed: plan without them).
  const holidays = useHolidays([year]);
  const rules = useEventRules();
  const eventsReady = holidays.byYear.has(year) || holidays.failedYears.includes(year);
  const plan = useQuery({
    queryKey: ["plan-month", clientId, month, round],
    enabled: open && eventsReady,
    queryFn: () => planMonth(clientId, month, planEvents(month, holidays.byYear, rules)),
    retry: false,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });

  // Ticked suggestions, by index. Everything starts ticked; a new round starts again.
  const [unticked, setUnticked] = useState<{ round: number; set: Set<number> }>({
    round,
    set: new Set(),
  });
  const off = unticked.round === round ? unticked.set : new Set<number>();
  const ideas = plan.data?.ideas ?? [];
  const picked = ideas.filter((_, i) => !off.has(i));
  const toggle = (i: number) => {
    const next = new Set(off);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setUnticked({ round, set: next });
  };

  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const path = useClientPath();
  const [saving, setSaving] = useState<"board" | "calendar" | null>(null);
  const [saveError, setSaveError] = useState<"board" | "calendar" | null>(null);

  async function save() {
    setSaving("board");
    setSaveError(null);
    let added = 0;
    try {
      for (const s of picked) {
        await createIdea(clientId, ideaFromSuggestion(s));
        added++;
      }
    } catch {
      setSaveError("board");
    }
    setSaving(null);
    if (added) void queryClient.invalidateQueries({ queryKey: ["ideas"] });
    if (added < picked.length) return; // stay open: the error says what happened
    onClose();
    toast.show({
      title: `Added ${added} ${added === 1 ? "idea" : "ideas"} to the board 💡`,
      detail: "Nothing is scheduled until you plan it.",
      pose: "success",
      action: { label: "Open", onClick: () => navigate(path("/ideas?tab=ai")) },
    });
  }

  /** Each ticked idea → the board, then plan_idea on its suggested day (an Idea card, origin 'ai'). */
  async function planAll() {
    setSaving("calendar");
    setSaveError(null);
    const planned: { id: string; date: string }[] = [];
    let touched = false;
    try {
      for (const s of picked) {
        const idea = await createIdea(clientId, ideaFromSuggestion(s));
        touched = true;
        planned.push(
          await planIdea({
            ideaId: idea.id,
            date: s.date,
            platform: s.platform,
            format: s.format,
            title: s.title,
          }),
        );
      }
    } catch {
      setSaveError("calendar");
    }
    setSaving(null);
    if (touched) {
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
    }
    if (planned.length < picked.length) return; // stay open: the error says what happened
    onClose();
    const first = [...planned].sort((a, b) => a.date.localeCompare(b.date))[0];
    toast.show({
      title: `Planned ${planned.length} ${planned.length === 1 ? "idea" : "ideas"} as Idea cards`,
      detail: `On Blip’s suggested days, from ${plannedLabel(first.date)}. Move or edit them any time.`,
      pose: "success",
      action: { label: "Open", onClick: () => navigate(path(`/calendar?date=${first.date}`)) },
    });
  }

  const regenerate = () => {
    setSaveError(null);
    setRound((r) => r + 1);
  };
  const loading = !plan.data && !plan.isError;
  const error =
    plan.error instanceof AiError ? plan.error : plan.isError ? new AiError("failed") : null;

  const header = (
    <div className="flex flex-col gap-1.5">
      <p className="mono-label text-muted">Plan {monthName}</p>
      <h2 className="text-heading md:text-heading-md">
        {plan.data
          ? `${ideas.length} ${ideas.length === 1 ? "idea" : "ideas"} for ${monthName} ${year}`
          : `Ideas for ${monthName} ${year}`}
      </h2>
    </div>
  );

  const busy = saving !== null;
  const footer = (
    <div className="flex flex-col gap-3">
      <p className="text-small text-muted">
        Add them to the idea board, or put them on the calendar as Idea cards on Blip’s days.
        Nothing is posted.
      </p>
      {/* Phones: the main action first, full width; then the two secondary ones side by side. */}
      <div className="grid grid-cols-2 gap-2.5 md:flex md:justify-end">
        <Button
          onClick={() => void save()}
          disabled={!plan.data || picked.length === 0 || busy}
          className="col-span-2 md:order-3"
        >
          {saving === "board"
            ? "Adding…"
            : picked.length === 0
              ? "Add to idea board"
              : `Add ${picked.length} to idea board`}
        </Button>
        <Button
          variant="secondary"
          onClick={regenerate}
          disabled={loading || busy}
          className="md:order-1"
        >
          Regenerate
        </Button>
        <Button
          variant="secondary"
          onClick={() => void planAll()}
          disabled={!plan.data || picked.length === 0 || busy}
          className="md:order-2"
        >
          {saving === "calendar" ? "Planning…" : "Add to calendar as Ideas"}
        </Button>
      </div>
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Plan ${monthName}`}
      header={header}
      footer={footer}
      backLabel="Calendar"
      wide
    >
      <div className="flex flex-col gap-4.5" aria-live="polite" aria-busy={loading}>
        {plan.data && (
          <div className="flex flex-col gap-2 rounded-tile bg-bg px-3.5 py-3">
            <p className="mono-label text-muted">30reach looked at</p>
            <ul className="flex flex-wrap gap-1.5">
              {factChips(plan.data.facts, monthName).map((c) => (
                <li key={c} className="rounded-full bg-surface px-2.5 py-1 font-mono text-label">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading && <PlanLoading monthName={monthName} />}

        {error && (
          <div role="alert" className="flex items-start gap-3 py-2">
            {error.kind === "no_pull" ? (
              <BlipIdle className="h-14 w-auto shrink-0" />
            ) : (
              <BlipError className="h-14 w-auto shrink-0" />
            )}
            <div className="flex flex-col items-start gap-1 pt-2">
              <p className="text-body-sm">
                {error.kind === "rate_limited"
                  ? AI_COPY.rateLimited
                  : error.kind === "no_pull"
                    ? AI_COPY.noPull
                    : AI_COPY.failed}
              </p>
              {error.kind === "failed" && (
                <button
                  type="button"
                  onClick={regenerate}
                  className="min-h-11 text-small font-medium text-blue hover:underline md:min-h-0"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {plan.data && (
          <ul className="overflow-hidden rounded-tile border border-line">
            {ideas.map((s, i) => (
              <Suggestion
                key={`${round}-${i}`}
                s={s}
                checked={!off.has(i)}
                onToggle={() => toggle(i)}
              />
            ))}
          </ul>
        )}

        {saveError === "board" && (
          <p role="alert" className="text-small text-spark">
            Couldn’t add all of them. The ones that were added are on the idea board; try again for
            the rest.
          </p>
        )}
        {saveError === "calendar" && (
          <p role="alert" className="text-small text-spark">
            Couldn’t plan all of them. Planned ones are on the calendar; any others are on the idea
            board, ready to plan.
          </p>
        )}
      </div>
    </Drawer>
  );
}

/** Blip/Scanning (static for now, animated in Slice 13) with lines that take turns. */
function PlanLoading({ monthName }: { monthName: string }) {
  const lines = planLoadingLines(monthName);
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % lines.length), PLAN_LINE_MS);
    return () => window.clearInterval(t);
  }, [lines.length]);
  return (
    <div className="flex items-center gap-3 py-2">
      <BlipScanning className="h-14 w-auto shrink-0" />
      <p className="text-body-sm text-muted" data-testid="plan-loading-line">
        {lines[i]}
      </p>
    </div>
  );
}

function Suggestion({
  s,
  checked,
  onToggle,
}: {
  s: PlanSuggestion;
  checked: boolean;
  onToggle: () => void;
}) {
  const meta = [shortDay(s.date), PLATFORM_SHORT[s.platform], formatName(s.platform, s.format)]
    .join("  ·  ")
    .toUpperCase();
  return (
    <li className="border-t border-line first:border-t-0">
      <label className="flex cursor-pointer items-start gap-3 px-3.5 py-3 hover:bg-bg">
        <Checkbox checked={checked} onChange={onToggle} className="mt-0.5" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-3 w-0.75 shrink-0 ${PLATFORM_BAR[s.platform]}`}
            />
            <span className="mono-label whitespace-pre text-muted">{meta}</span>
          </span>
          <span className="text-body font-medium">{s.title}</span>
          <span className="text-small text-muted">Why: {s.reason}</span>
        </span>
      </label>
    </li>
  );
}
