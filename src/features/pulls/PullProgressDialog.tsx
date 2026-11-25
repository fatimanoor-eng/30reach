import { Check } from "lucide-react";
import { BlipScanning } from "../../components/blip/BlipPoses";
import { ResponsiveDialog } from "../../components/ResponsiveDialog";
import { PLATFORM_ICON, PLATFORMS } from "../../lib/platforms";
import type { Platform } from "../../lib/pulls/api";
import type { TaskProgress } from "../../lib/pulls/run-pull";
import { MQ_TABLET_UP, useMediaQuery } from "../../lib/useMediaQuery";
import { usePull } from "./pull-context";
import {
  mobileProgressLine,
  PLATFORM_LABEL,
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
        {tabletUp ? (
          <BrandGrid tasks={tasks} />
        ) : (
          <p className="text-center font-mono text-small text-muted" aria-live="polite">
            {tasks.length ? mobileProgressLine(tasks) : "Warming up…"}
          </p>
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

/** Brand × platform grid: ✓ done · "pulling" · "waiting" · "not found" / "daily limit" / "failed" in red. */
function BrandGrid({ tasks }: { tasks: TaskProgress[] }) {
  const platforms = PLATFORMS.filter((p) => tasks.some((t) => t.platform === p));
  const brands = [...new Set(tasks.map((t) => t.brand))];
  if (!tasks.length) return <p className="font-mono text-small text-muted">Warming up…</p>;

  return (
    // Border lives on a wrapper: tables (border-collapse) don't draw rounded borders.
    <div className="overflow-hidden rounded-tile border border-line">
      <table className="w-full text-left text-body-sm">
        <caption className="sr-only">Pull progress by brand and platform</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Brand</th>
            {platforms.map((p) => (
              <th key={p} scope="col">
                {PLATFORM_LABEL[p]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {brands.map((brand) => (
            <tr key={brand}>
              <th scope="row" className="px-4 py-2.5 font-normal">
                {brand}
              </th>
              {platforms.map((p) => (
                <td key={p} className="w-32 px-3 py-2.5">
                  <Cell
                    task={tasks.find((t) => t.brand === brand && t.platform === p)}
                    platform={p}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ task, platform }: { task?: TaskProgress; platform: Platform }) {
  const Icon = PLATFORM_ICON[platform];
  if (!task) return <span className="text-muted">—</span>;
  const status =
    task.status === "done" ? (
      <Check size={16} aria-label="done" />
    ) : task.status === "running" ? (
      <span className="font-mono text-label">pulling</span>
    ) : task.status === "queued" ? (
      <span className="font-mono text-label text-muted">waiting</span>
    ) : (
      <span className="font-mono text-label text-spark">
        {task.errorCode === "not_found"
          ? "not found"
          : task.errorCode === "quota"
            ? "daily limit"
            : "failed"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2">
      <Icon size={16} aria-label={PLATFORM_LABEL[platform]} className="text-muted" />
      {status}
    </span>
  );
}
