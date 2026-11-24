import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { BlipIdle } from "../../components/blip/BlipPoses";
import { Button } from "../../components/Button";
import { plural } from "../../lib/format";
import type { Competitor } from "../../lib/useCompetitors";
import { percentOf, usePull } from "../pulls/pull-context";
import { useClientPath } from "../../lib/useClient";

/** 03 First run — shown until the client's first real pull is saved. */
export function FirstRun({
  clientName,
  competitors,
}: {
  clientName: string;
  competitors: Competitor[];
}) {
  const pull = usePull();
  const path = useClientPath();
  const label =
    pull.state.kind === "running"
      ? `Pulling… ${percentOf(pull.state)}%`
      : pull.state.kind === "interrupted"
        ? `Resume pull · ${percentOf(pull.state)}%`
        : "Pull data now";

  return (
    <div className="mx-auto flex max-w-140 flex-col items-center py-6 text-center md:py-12">
      <BlipIdle className="h-auto w-24 md:w-28" />
      <p className="mt-6 mono-label text-muted">No data yet</p>
      <h1 className="mt-4 text-title md:text-display">Run your first pull</h1>
      <p className="mt-4 text-body text-muted">
        30reach hasn’t pulled any competitor posts for {clientName} yet. Pulls only run when you
        press the button, and each one shows its credit cost first.
      </p>

      <ol className="mt-8 w-full divide-y divide-line overflow-hidden rounded-card border border-line bg-surface text-left">
        <Step done title="Competitors set">
          {competitors.length
            ? `${plural(competitors.length, "brand")}: ${competitors.map((c) => c.name).join(", ")}`
            : "No competitors yet — add them first"}
        </Step>
        <Step done title="Calendar dates are ready">
          Holidays, health months and marketing dates are added automatically
        </Step>
        <Step number={3} title="Pull Instagram and TikTok">
          Saves the latest posts so they show every time you open 30reach
        </Step>
      </ol>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button
          onClick={pull.onRefreshClick}
          disabled={!pull.clientId || pull.state.kind === "starting"}
        >
          {label}
        </Button>
        <Link
          to={path("/competitors")}
          className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-4 text-body-sm font-medium hover:bg-soft md:min-h-10"
        >
          Review competitors
        </Link>
      </div>
    </div>
  );
}

function Step({
  done = false,
  number,
  title,
  children,
}: {
  done?: boolean;
  number?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-4 px-5 py-4">
      {done ? (
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fresh text-white">
          <Check size={16} aria-label="Done" />
        </span>
      ) : (
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line font-mono text-label text-muted">
          {number}
        </span>
      )}
      <span>
        <span className="block text-body">{title}</span>
        <span className="block text-small text-muted">{children}</span>
      </span>
    </li>
  );
}
