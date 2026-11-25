import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ResponsiveDialog } from "../../components/ResponsiveDialog";
import { formatNumber, formatShortDate, plural } from "../../lib/format";
import { PLATFORM_ICON, PLATFORMS } from "../../lib/platforms";
import { type Platform, pullStart, type PullStartResponse } from "../../lib/pulls/api";
import { useClient, useClientPath } from "../../lib/useClient";
import { usePull } from "./pull-context";
import { useSavedPulls } from "../overview/useOverviewData";
import {
  availablePlatforms,
  durationText,
  initialSelection,
  keepsLine,
  noAccountsText,
  otherPullingText,
  PLATFORM_LABEL,
  refreshIntro,
  rowCost,
  selectionCost,
  YOUTUBE_LIMIT_ALONE,
} from "./pull-text";

const TITLE = "Refresh competitor data?";

/** pull-start found nothing to pull for this client (Slice 17c fix): say why instead of "Couldn't estimate". */
class NothingToPull extends Error {
  constructor(public code: "no_competitors" | "no_accounts" | "no_platforms") {
    super(code);
  }
}

/**
 * 05 Refresh — confirm cost (dialog) / M03 (bottom sheet). The estimate comes from pull-start with
 * preview: true (live balance, 0 credits). Not enough credits for everything (05f): the same picker with a
 * warning (18b).
 */
export function RefreshDialog() {
  const { refreshOpen, closeRefresh, clientId } = usePull();
  const preview = useQuery({
    queryKey: ["pull-preview", clientId],
    enabled: refreshOpen && !!clientId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async (): Promise<PullStartResponse> => {
      const res = await pullStart({ clientId: clientId!, preview: true });
      if (res.ok) return res.data;
      if (res.status === 409) {
        const data = res.data as unknown as PullStartResponse;
        return { ...data, status: data.status === "other_running" ? "other_running" : "running" };
      }
      const code = res.data?.error;
      if (code === "no_competitors" || code === "no_accounts" || code === "no_platforms") {
        throw new NothingToPull(code);
      }
      throw new Error(
        res.status === 502
          ? "Firecrawl credits couldn’t be checked."
          : "Couldn’t estimate the cost.",
      );
    },
  });

  // Mounted by PullProvider inside <ModalPresence open={refreshOpen}>, so it can slide out when closed.
  if (preview.isPending) {
    return (
      <ResponsiveDialog
        open
        onClose={closeRefresh}
        title={TITLE}
        description="Checking your Firecrawl credits…"
        primary={{
          label: "Pull now",
          icon: <RefreshCw size={16} />,
          disabled: true,
          onClick: () => {},
        }}
      />
    );
  }
  if (preview.error instanceof NothingToPull)
    return <NothingToPullDialog code={preview.error.code} />;
  if (preview.isError) {
    return (
      <ResponsiveDialog
        open
        onClose={closeRefresh}
        title={TITLE}
        description={preview.error.message}
        primary={{ label: "Try again", onClick: () => void preview.refetch() }}
      />
    );
  }
  if (preview.data.status === "running") return <AlreadyRunning />;
  if (preview.data.status === "other_running")
    return <OtherClientPulling name={preview.data.clientName ?? "Another client"} />;
  // 05f (not enough credits for everything) is the same picker with a warning (18b).
  return <ConfirmCost preview={preview.data} />;
}

/**
 * 05 / M03, and 05f (18b): one picker. Every platform the client tracks, ticked by default (YouTube unticked
 * when Google's daily limit already ran out today), each with its cost and a live total. Unticked platforms
 * aren't pulled: the pull copies their data from the last one ("Keeps the 16 Nov data"), so nothing goes
 * blank. Not enough credits for a full pull: a warning, and as many platforms ticked as fit, in the usual
 * order; Pull now waits until the selection fits.
 */
function ConfirmCost({ preview }: { preview: PullStartResponse }) {
  const { closeRefresh, start } = usePull();
  const latest = useSavedPulls().data?.latest ?? null;
  const platforms = availablePlatforms(preview);
  const [selected, setSelected] = useState<Platform[]>(() => initialSelection(preview));
  const cost = selectionCost(preview, selected);
  const left = preview.credits.remaining;
  const fits = cost.max <= left;
  const short = preview.status === "insufficient";
  const reset = formatShortDate(preview.credits.resetsAt);
  const after = Math.max(0, left - cost.expected);
  const dataFrom = (p: Platform) => (latest ? (latest.carried?.[p] ?? latest.started_at) : null);

  const toggle = (p: Platform) =>
    setSelected((s) =>
      s.includes(p) ? s.filter((x) => x !== p) : platforms.filter((x) => x === p || s.includes(x)),
    );

  return (
    <ResponsiveDialog
      open
      onClose={closeRefresh}
      title={short ? "Not enough credits for a full pull" : TITLE}
      description={refreshIntro(preview)}
      primary={{
        label: "Pull now",
        icon: <RefreshCw size={16} />,
        disabled: selected.length === 0 || !fits,
        onClick: () => void start(selected),
      }}
    >
      <div className="flex flex-col gap-4">
        {short && (
          <p
            role={fits ? undefined : "alert"}
            className="rounded-tile bg-spark-tint px-4 py-3 text-small text-spark-text"
          >
            You have {plural(left, "credit")} left{reset ? ` until ${reset}` : ""}. Untick platforms
            until it fits; they keep their last data.
          </p>
        )}
        <fieldset className="divide-y divide-line overflow-hidden rounded-tile border border-line">
          <legend className="sr-only">Platforms to pull</legend>
          {platforms.map((p) => {
            const Icon = PLATFORM_ICON[p];
            const on = selected.includes(p);
            const limit = p === "youtube" && preview.youtubeLimitToday;
            const note = limit ? YOUTUBE_LIMIT_ALONE : on ? null : keepsLine(dataFrom(p));
            return (
              <label key={p} className="flex min-h-12 cursor-pointer items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(p)}
                  className="mt-0.5 size-5 shrink-0 accent-ink"
                />
                <Icon size={18} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  {/* One cost: on the right from tablet up; on phones it wraps under the name. */}
                  <span className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-body">{PLATFORM_LABEL[p]}</span>
                    <span className="basis-full font-mono text-small text-muted md:ml-auto md:basis-auto md:text-right">
                      {rowCost(preview, p)}
                    </span>
                  </span>
                  {note && (
                    <span
                      className={`block text-small ${limit ? "text-spark-text" : "text-muted"}`}
                    >
                      {note}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-tile bg-soft px-4 py-3 text-small">
          <dt className="text-muted">Estimated cost</dt>
          <dd className={`text-right font-mono ${fits ? "" : "text-spark-text"}`}>
            up to {plural(cost.max, "credit")}
          </dd>
          <dt className="text-muted">Credits left this month</dt>
          <dd className="text-right font-mono">
            {formatNumber(left)} of {formatNumber(preview.credits.plan)}
          </dd>
          <dt className="text-muted">After this pull</dt>
          <dd className="text-right font-mono">about {formatNumber(after)}</dd>
        </dl>

        <p className="text-small text-muted">
          Takes {durationText(cost.expected)} — you can keep working while it runs. Estimates are
          based on your last pull; a pull never spends more than the “up to” amount.
        </p>
      </div>
    </ResponsiveDialog>
  );
}

/** Another tab or device already started a pull: follow it instead of starting a second one. */
function AlreadyRunning() {
  const { closeRefresh, start } = usePull();
  return (
    <ResponsiveDialog
      open
      onClose={closeRefresh}
      title="A pull is already running"
      description="Someone started a pull a moment ago. You can follow its progress here."
      // pull-start answers 409 + the running pull's id; the provider then drives and shows it.
      primary={{ label: "Show progress", onClick: () => void start(PLATFORMS) }}
    />
  );
}

/**
 * Another client is pulling (17a): one pull at a time across all clients, so Firecrawl's free plan
 * doesn't rate-limit two pulls at once.
 */
function OtherClientPulling({ name }: { name: string }) {
  const { closeRefresh } = usePull();
  return (
    <ResponsiveDialog
      open
      onClose={closeRefresh}
      title="Another pull is running"
      description={otherPullingText(name)}
      primary={{ label: "OK", onClick: closeRefresh }}
      cancelLabel={null}
    />
  );
}

/** No competitor with an account on a tracked platform, or no platform switched on: nothing is charged. */
function NothingToPullDialog({ code }: { code: NothingToPull["code"] }) {
  const { closeRefresh } = usePull();
  const client = useClient().data?.name ?? "This client";
  const navigate = useNavigate();
  const path = useClientPath();
  const platforms = code === "no_platforms";
  return (
    <ResponsiveDialog
      open
      onClose={closeRefresh}
      title={TITLE}
      description={
        platforms
          ? `${client} has no platforms switched on. Turn one on in Client settings to run a pull.`
          : noAccountsText(client)
      }
      primary={{
        label: platforms ? "Client settings" : "Add competitors",
        onClick: () => {
          closeRefresh();
          navigate(path(platforms ? "/client-settings" : "/competitors?add=1"));
        },
      }}
    />
  );
}
