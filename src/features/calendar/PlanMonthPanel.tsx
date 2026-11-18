import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { BlipError, BlipIdle, BlipThinking } from "../../components/blip/BlipPoses";
import { Button } from "../../components/Button";
import { Drawer } from "../../components/Drawer";
import { useToast } from "../../components/toast-context";
import { AI_COPY, AiError, planMonth, type PlanSuggestion } from "../../lib/ai/ai-api";
import { createIdea } from "../ideas/ideas-api";
import { FORMAT_NAME, PLATFORM_BAR, PLATFORM_SHORT } from "./calendar-ui";
import { shortDay } from "./format";
import { factChips, ideaFromSuggestion, planEvents } from "./plan-month";
import { useHolidays } from "./useHolidays";

/**
 * 10 Plan {month}: Blip suggests ~6 dated post ideas with reasons; the ones the team ticks go to the
 * IDEA BOARD (kind 'ai'), never onto the calendar (CLAUDE.md rule 6). Drawer from 768 px (600 px wide),
 * full screen on phones. One Groq request per open (kept for the session); "Regenerate" asks again.
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
  const eventsReady = holidays.byYear.has(year) || holidays.failedYears.includes(year);
  const plan = useQuery({
    queryKey: ["plan-month", clientId, month, round],
    enabled: open && eventsReady,
    queryFn: () => planMonth(clientId, month, planEvents(month, holidays.byYear)),
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  async function save() {
    setSaving(true);
    setSaveError(false);
    let added = 0;
    try {
      for (const s of picked) {
        await createIdea(clientId, ideaFromSuggestion(s));
        added++;
      }
    } catch {
      setSaveError(true);
    }
    setSaving(false);
    if (added) void queryClient.invalidateQueries({ queryKey: ["ideas"] });
    if (added < picked.length) return; // stay open: the error says what happened
    onClose();
    toast.show({
      title: `Added ${added} ${added === 1 ? "idea" : "ideas"} to the idea board`,
      detail: "Nothing is scheduled until you plan it.",
      pose: "success",
      action: { label: "Open", onClick: () => navigate("/ideas?tab=ai") },
    });
  }

  const regenerate = () => {
    setSaveError(false);
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

  const footer = (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p className="text-small text-muted md:max-w-62.5">
        Ideas go to the idea board first. Nothing is scheduled until you drag it.
      </p>
      <div className="flex gap-2.5">
        <Button
          variant="secondary"
          onClick={regenerate}
          disabled={loading || saving}
          className="flex-1 md:flex-none"
        >
          Regenerate
        </Button>
        <Button
          onClick={() => void save()}
          disabled={!plan.data || picked.length === 0 || saving}
          className="flex-1 md:flex-none"
        >
          {saving
            ? "Adding…"
            : picked.length === 0
              ? "Add to idea board"
              : `Add ${picked.length} to idea board`}
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

        {loading && (
          <div className="flex items-center gap-3 py-2">
            <BlipThinking className="h-14 w-auto shrink-0" />
            <p className="text-body-sm text-muted">
              Blip is planning {monthName}: events, what works for competitors and your board…
            </p>
          </div>
        )}

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

        {saveError && (
          <p role="alert" className="text-small text-spark">
            Couldn’t add all of them. The ones that were added are on the idea board; try again for
            the rest.
          </p>
        )}
      </div>
    </Drawer>
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
  const meta = [shortDay(s.date), PLATFORM_SHORT[s.platform], FORMAT_NAME[s.format] ?? s.format]
    .join("  ·  ")
    .toUpperCase();
  return (
    <li className="border-t border-line first:border-t-0">
      <label className="flex cursor-pointer items-start gap-3 px-3.5 py-3 hover:bg-bg">
        <input type="checkbox" checked={checked} onChange={onToggle} className="peer sr-only" />
        <span
          aria-hidden="true"
          className={`mt-0.5 inline-flex size-4.5 shrink-0 items-center justify-center rounded-[5px] peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30 ${
            checked ? "bg-ink text-white" : "border-[1.5px] border-line bg-surface"
          }`}
        >
          {checked && <Check size={12} strokeWidth={3} />}
        </span>
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
