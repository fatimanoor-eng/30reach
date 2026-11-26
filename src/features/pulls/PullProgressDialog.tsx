import { Check } from "lucide-react";
import { BlipScanning } from "../../components/blip/BlipPoses";
import { ResponsiveDialog } from "../../components/ResponsiveDialog";
import { PLATFORM_ICON, PLATFORMS } from "../../lib/platforms";
import type { TaskProgress } from "../../lib/pulls/run-pull";
import { MQ_TABLET_UP, useMediaQuery } from "../../lib/useMediaQuery";
import { usePull } from "./pull-context";
import {
  mobileProgressLine,
  PLATFORM_LABEL,
  taskProblem,
  YOUTUBE_LIMIT,
  YOUTUBE_LIMIT_ALONE,
} from "./pull-text";

/**
 * 05b Pulling — in progress (card) / M04 (sheet). Old data stays visible underneath.
 * "Keep working" hides it; the pull continues and the Refresh button shows progress (05c).
 */
export function PullProgressDialog() {
  const { state, hideCard } = usePull();
  const tabletUp = useMediaQuery(MQ_TABLET_UP);
  // Shown by PullProvider inside <ModalPresence> (open while running + card open), so it can slide out.

  // While it slides out the pull may already have finished (state idle): fall back to empty values.
  const progress = "progress" in state ? state.progress : null;
  const tasks = progress?.tasks ?? [];
  const fraction = progress?.fraction ?? 0;
  const used = progress?.creditsUsed ?? 0;

  return (
    <ResponsiveDialog
      open
      onClose={hideCard}
      align="center"
      size="lg"
      illustration={<BlipScanning />}
      title="Blip’s scanning the competition…"
      description={
        tabletUp
          ? "This can take a little while. Keep using 30reach, we’ll let you know when it’s done."
          : undefined
      }
      primary={{ label: "Keep working", variant: "secondary", onClick: hideCard }}
      cancelLabel={null}
      footer={
        tabletUp ? <p className="mono-label text-muted">Credits used so far · {used}</p> : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div
          role="progressbar"
          aria-label="Pull progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          className="h-1.5 overflow-hidden rounded-full bg-soft"
        >
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-500"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        {/* 27 Nov: one compact line per brand at every size (the grid overflowed: long names, X cut off). */}
        <BrandList tasks={tasks} />
        <p className="sr-only" aria-live="polite">
          {tasks.length ? mobileProgressLine(tasks) : ""}
        </p>
        {/* Problems in plain words, one per brand × platform. */}
        {tasks.some((t) => t.status === "failed" && t.errorCode !== "quota") && (
          <ul className="flex flex-col gap-1 text-small text-spark-text" role="status">
            {tasks
              .filter((t) => t.status === "failed" && t.errorCode !== "quota")
              .map((t) => (
                <li key={t.id}>{taskProblem(t)}</li>
              ))}
          </ul>
        )}
        {/* 18b: YouTube's free daily allowance ran out during this pull. */}
        {tasks.some((t) => t.errorCode === "quota") && (
          <p role="status" className="text-small text-spark-text">
            {tasks.some((t) => t.platform !== "youtube") ? YOUTUBE_LIMIT : YOUTUBE_LIMIT_ALONE}
          </p>
        )}
      </div>
    </ResponsiveDialog>
  );
}

/**
 * One line per brand (27 Nov redesign): its short name (truncated), then a small icon per platform with
 * its status: waiting (faded), pulling (turning ring), done (✓ badge), problem (! badge). No columns, so
 * nothing overflows at 390 / 768 / 1440.
 */
function BrandList({ tasks }: { tasks: TaskProgress[] }) {
  if (!tasks.length) return <p className="font-mono text-small text-muted">Warming up…</p>;
  const platforms = PLATFORMS.filter((p) => tasks.some((t) => t.platform === p));
  const brands = [...new Set(tasks.map((t) => t.brand))];
  return (
    <ul
      aria-label="Pull progress by brand"
      className="max-h-[40dvh] divide-y divide-line overflow-y-auto rounded-tile border border-line text-left"
    >
      {brands.map((brand) => (
        <li key={brand} className="flex min-h-11 items-center gap-3 px-3 py-2 md:px-4">
          <span className="min-w-0 flex-1 truncate text-body-sm" title={brand}>
            {brand}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {platforms.map((p) => {
              const task = tasks.find((t) => t.brand === brand && t.platform === p);
              return task ? <StatusIcon key={p} task={task} /> : null;
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

const STATUS_WORD = {
  queued: "waiting",
  running: "pulling",
  done: "done",
  failed: "problem",
} as const;

function StatusIcon({ task }: { task: TaskProgress }) {
  const Icon = PLATFORM_ICON[task.platform];
  const word = STATUS_WORD[task.status as keyof typeof STATUS_WORD] ?? task.status;
  const label = `${PLATFORM_LABEL[task.platform]}: ${word}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`relative inline-flex size-7 items-center justify-center rounded-full ${
        task.status === "queued" ? "text-line-strong" : "text-ink"
      }`}
    >
      <Icon size={15} aria-hidden="true" />
      {task.status === "running" && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-line border-t-ink motion-safe:animate-spin"
        />
      )}
      {task.status === "done" && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-fresh text-white ring-2 ring-surface"
        >
          <Check size={9} strokeWidth={3.5} />
        </span>
      )}
      {task.status === "failed" && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-spark font-mono text-[9px] leading-none font-bold text-white ring-2 ring-surface"
        >
          !
        </span>
      )}
    </span>
  );
}
