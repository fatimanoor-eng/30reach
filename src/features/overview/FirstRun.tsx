import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { BlipIdle } from "../../components/blip/BlipPoses";
import { Button } from "../../components/Button";
import { plural } from "../../lib/format";
import {
  PLATFORM_NAME,
  platformsWithAccounts,
  pullReadiness,
  type Platform,
} from "../../lib/platforms";
import { useTrackedPlatforms } from "../../lib/useClientPlatforms";
import type { Competitor } from "../../lib/useCompetitors";
import { percentOf, usePull } from "../pulls/pull-context";
import { noAccountsText } from "../pulls/pull-text";
import { useClientPath } from "../../lib/useClient";

/**
 * 03 First run — shown until the client's first real pull is saved. With nothing to pull (no competitors,
 * or none with an account on a tracked platform) step 1 isn't ticked, "Pull data now" is disabled with
 * the reason, and "Add competitors" leads the way (same rule as pull-start).
 */
export function FirstRun({
  clientName,
  competitors,
}: {
  clientName: string;
  competitors: Competitor[];
}) {
  const pull = usePull();
  const path = useClientPath();
  const tracked = useTrackedPlatforms();
  const readiness = pullReadiness(competitors, tracked);
  const ready = readiness === "ok";
  const busy = pull.state.kind !== "idle"; // a pull already running / paused for this client
  // Platforms the first pull will cover: tracked ones a competitor has an account on.
  const pulling = platformsWithAccounts(competitors).filter((p) => !tracked || tracked.includes(p));
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
        {readiness === "no_competitors" ? (
          <Step number={1} title="No competitors yet">
            Add the brands you want to track
          </Step>
        ) : readiness === "no_accounts" ? (
          <Step number={1} title="No competitor accounts yet">
            {`${plural(competitors.length, "brand")}, but none has an account on ${platformList(tracked)}`}
          </Step>
        ) : (
          <Step done title="Competitors set">
            {`${plural(competitors.length, "brand")}: ${competitors.map((c) => c.name).join(", ")}`}
          </Step>
        )}
        <Step done title="Calendar dates are ready">
          Holidays, health months and marketing dates are added automatically
        </Step>
        <Step number={3} title={`Pull ${platformList(ready ? pulling : tracked)}`}>
          Saves the latest posts so they show every time you open 30reach
        </Step>
      </ol>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button
          onClick={pull.onRefreshClick}
          disabled={!pull.clientId || pull.state.kind === "starting" || (!ready && !busy)}
          aria-describedby={!ready && !busy ? "first-run-hint" : undefined}
        >
          {label}
        </Button>
        <Link
          to={path(ready ? "/competitors" : "/competitors?add=1")}
          className={`inline-flex min-h-11 items-center rounded-control px-4 text-body-sm font-medium md:min-h-10 ${
            ready
              ? "border border-line bg-surface hover:bg-soft"
              : "bg-ink text-white hover:bg-sidebar-2"
          }`}
        >
          {ready ? "Review competitors" : "Add competitors"}
        </Link>
      </div>
      {!ready && !busy && (
        <p id="first-run-hint" className="mt-3 text-small text-muted">
          {noAccountsText(clientName)}
        </p>
      )}
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

/** "Instagram, TikTok and LinkedIn" (every platform while the list loads). */
function platformList(platforms: readonly Platform[] | null): string {
  const names = (platforms ?? (Object.keys(PLATFORM_NAME) as Platform[])).map(
    (p) => PLATFORM_NAME[p],
  );
  if (names.length <= 1) return names[0] ?? "your platforms";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
