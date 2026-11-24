import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { BlipError } from "../../components/blip/BlipPoses";
import { ResponsiveDialog } from "../../components/ResponsiveDialog";
import { formatNumber, formatShortDate, plural } from "../../lib/format";
import { PLATFORM_ICON, PLATFORMS } from "../../lib/platforms";
import { type Platform, pullStart, type PullStartResponse } from "../../lib/pulls/api";
import { usePull } from "./pull-context";
import {
  availablePlatforms,
  durationText,
  fittingPlatforms,
  otherPullingText,
  PLATFORM_LABEL,
  platformEstimate,
  refreshIntro,
  selectionCost,
} from "./pull-text";

const TITLE = "Refresh competitor data?";

/**
 * 05 Refresh — confirm cost (dialog) / M03 (bottom sheet). The estimate comes from pull-start with
 * preview: true (live balance, 0 credits). If the maximum doesn't fit, it shows 05f instead.
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
  return preview.data.status === "insufficient" ? (
    <NotEnoughCredits preview={preview.data} />
  ) : (
    <ConfirmCost preview={preview.data} />
  );
}

/** 05 / M03 */
function ConfirmCost({ preview }: { preview: PullStartResponse }) {
  const { closeRefresh, start } = usePull();
  const platforms = availablePlatforms(preview);
  const [selected, setSelected] = useState<Platform[]>(platforms);
  const cost = selectionCost(preview, selected);
  const after = Math.max(0, preview.credits.remaining - cost.expected);

  const toggle = (p: Platform) =>
    setSelected((s) =>
      s.includes(p) ? s.filter((x) => x !== p) : platforms.filter((x) => x === p || s.includes(x)),
    );

  return (
    <ResponsiveDialog
      open
      onClose={closeRefresh}
      title={TITLE}
      description={refreshIntro(preview)}
      primary={{
        label: "Pull now",
        icon: <RefreshCw size={16} />,
        disabled: selected.length === 0,
        onClick: () => void start(selected),
      }}
    >
      <div className="flex flex-col gap-4">
        <fieldset className="divide-y divide-line overflow-hidden rounded-tile border border-line">
          <legend className="sr-only">Platforms to pull</legend>
          {platforms.map((p) => {
            const Icon = PLATFORM_ICON[p];
            return (
              <label key={p} className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2">
                <input
                  type="checkbox"
                  checked={selected.includes(p)}
                  onChange={() => toggle(p)}
                  className="size-5 shrink-0 accent-ink"
                />
                <Icon size={18} />
                <span className="flex-1 text-body">{PLATFORM_LABEL[p]}</span>
                <span className="font-mono text-small text-muted">
                  ~{plural(platformEstimate(preview, p).expected, "credit")}
                </span>
              </label>
            );
          })}
        </fieldset>

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-tile bg-soft px-4 py-3 text-small">
          <dt className="text-muted">Estimated cost</dt>
          <dd className="text-right font-mono">up to {plural(cost.max, "credit")}</dd>
          <dt className="text-muted">Credits left this month</dt>
          <dd className="text-right font-mono">
            {formatNumber(preview.credits.remaining)} of {formatNumber(preview.credits.plan)}
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

/** 05f: the full pull's maximum doesn't fit what's left. */
function NotEnoughCredits({ preview }: { preview: PullStartResponse }) {
  const { closeRefresh, start } = usePull();
  const fits = fittingPlatforms(preview);
  const [choice, setChoice] = useState<Platform | "wait">(fits[0] ?? "wait");
  const reset = formatShortDate(preview.credits.resetsAt);

  return (
    <ResponsiveDialog
      open
      onClose={closeRefresh}
      align="center"
      illustration={<BlipError />}
      title="Not enough credits for a full pull"
      primary={
        choice === "wait"
          ? { label: "OK", onClick: closeRefresh }
          : { label: `Pull ${PLATFORM_LABEL[choice]} only`, onClick: () => void start([choice]) }
      }
    >
      <div className="flex flex-col gap-4 text-left">
        <p className="text-body-sm text-muted">
          This pull needs up to {plural(preview.estimate.max, "credit")}, and you have{" "}
          {formatNumber(preview.credits.remaining)} left{reset ? ` until ${reset}` : ""}. The free
          plan can’t buy more.
        </p>
        <fieldset className="divide-y divide-line overflow-hidden rounded-tile border border-line">
          <legend className="sr-only">What to do</legend>
          {fits.map((p) => (
            <Option
              key={p}
              checked={choice === p}
              onChange={() => setChoice(p)}
              title={`Pull ${PLATFORM_LABEL[p]} only`}
              text={`about ${plural(platformEstimate(preview, p).expected, "credit")} · fits what’s left`}
            />
          ))}
          <Option
            checked={choice === "wait"}
            onChange={() => setChoice("wait")}
            title="Wait for the reset"
            text={
              reset ? `Full pull on ${reset} when credits reset` : "Full pull when credits reset"
            }
          />
        </fieldset>
      </div>
    </ResponsiveDialog>
  );
}

function Option(props: { checked: boolean; onChange: () => void; title: string; text: string }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3">
      <input
        type="radio"
        name="not-enough-credits"
        checked={props.checked}
        onChange={props.onChange}
        className="mt-0.5 size-5 shrink-0 accent-ink"
      />
      <span>
        <span className="block text-body">{props.title}</span>
        <span className="block text-small text-muted">{props.text}</span>
      </span>
    </label>
  );
}
