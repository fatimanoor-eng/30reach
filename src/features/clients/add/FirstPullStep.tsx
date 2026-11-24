import { useQuery } from "@tanstack/react-query";
import { BlipSuccess } from "../../../components/blip/BlipPoses";
import { Button } from "../../../components/Button";
import { formatNumber, plural } from "../../../lib/format";
import { PLATFORM_ICON, PLATFORM_NAME } from "../../../lib/platforms";
import { pullStart, type PullStartResponse } from "../../../lib/pulls/api";
import { MQ_TABLET_UP, useMediaQuery } from "../../../lib/useMediaQuery";
import {
  availablePlatforms,
  noAccountsText,
  otherPullingText,
  platformEstimate,
  selectionCost,
} from "../../pulls/pull-text";

type Preview =
  | { kind: "ok"; data: PullStartResponse }
  | { kind: "other"; name: string }
  | { kind: "empty" }
  | { kind: "failed" };

/**
 * 15e / M17 First pull: the client exists now (Blip/Success). The same estimate as Refresh (05): per
 * platform, the hard maximum, credits left and after. "Pull now" opens the new client's Overview with the
 * pull running; "Later" opens it in its first-run state. Another client pulling → its note + Later only.
 */
export function FirstPullStep({
  client,
  onLater,
  onPullNow,
}: {
  client: { id: string; name: string };
  onLater: () => void;
  onPullNow: () => void;
}) {
  const tabletUp = useMediaQuery(MQ_TABLET_UP);
  const preview = useQuery({
    queryKey: ["first-pull-preview", client.id],
    retry: false,
    staleTime: 0,
    queryFn: async (): Promise<Preview> => {
      const res = await pullStart({ clientId: client.id, preview: true });
      if (res.ok) return { kind: "ok", data: res.data };
      if (res.status === 409 && res.data?.status === "other_running")
        return { kind: "other", name: String(res.data.clientName ?? "Another client") };
      const code = res.data?.error;
      if (code === "no_competitors" || code === "no_accounts" || code === "no_platforms")
        return { kind: "empty" };
      return { kind: "failed" };
    },
  });
  const p = preview.data;
  const data = p?.kind === "ok" ? p.data : null;
  const platforms = data ? availablePlatforms(data) : [];
  const cost = data ? selectionCost(data, platforms) : null;
  const fits = data && cost ? cost.max <= data.credits.remaining : false;
  const note =
    p?.kind === "other"
      ? otherPullingText(p.name)
      : p?.kind === "empty"
        ? noAccountsText(client.name)
        : p?.kind === "failed"
          ? "Couldn’t estimate the cost. You can pull later with Refresh."
          : data && !fits
            ? `This pull needs up to ${plural(cost!.max, "credit")}, more than the ${formatNumber(data.credits.remaining)} left this month.`
            : null;

  return (
    <div className="mx-auto flex max-w-110 flex-col items-center px-4 py-8 text-center md:max-w-110 md:py-12">
      <BlipSuccess className="h-auto w-24 md:w-28" />
      <h1 className="mt-4 text-title md:mt-6">{client.name} is ready</h1>
      <p className="mt-3 text-body-sm text-muted">
        {tabletUp
          ? "Run the first pull now to fill Overview, or later with Refresh. Nothing is pulled until you say so."
          : "Run the first pull now, or later with Refresh."}
      </p>

      <div className="mt-6 w-full rounded-card border border-line bg-surface p-4 text-left md:p-5">
        {preview.isPending ? (
          <p className="py-6 text-center text-body-sm text-muted" aria-busy="true">
            Checking your Firecrawl credits…
          </p>
        ) : (
          <>
            {data && (
              <>
                <p className="hidden mono-label text-muted md:block">
                  First pull · last {data.windowDays} days · {plural(data.brands, "brand")}
                </p>
                <ul className="mt-2">
                  {platforms.map((pl) => {
                    const Icon = PLATFORM_ICON[pl];
                    return (
                      <li
                        key={pl}
                        className="flex min-h-11 items-center gap-3 border-b border-line"
                      >
                        <Icon size={16} />
                        <span className="flex-1 text-body-sm">{PLATFORM_NAME[pl]}</span>
                        <span className="font-mono text-label text-muted">
                          ~{plural(platformEstimate(data, pl).expected, "credit")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-control bg-bg px-3 py-3 text-small">
                  <dt className="text-muted">Estimated cost</dt>
                  <dd className="text-right font-mono">up to {plural(cost!.max, "credit")}</dd>
                  <dt className="text-muted">
                    {tabletUp ? "Credits left this month" : "Credits left"}
                  </dt>
                  <dd className="text-right font-mono">
                    {formatNumber(data.credits.remaining)} of {formatNumber(data.credits.plan)}
                  </dd>
                  {tabletUp && (
                    <>
                      <dt className="text-muted">After this pull</dt>
                      <dd className="text-right font-mono">
                        about {formatNumber(Math.max(0, data.credits.remaining - cost!.expected))}
                      </dd>
                    </>
                  )}
                </dl>
              </>
            )}
            {note && (
              <p role="status" className="mt-3 text-body-sm text-muted">
                {note}
              </p>
            )}
            <div className="mt-4 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <Button
                variant={note ? "primary" : "secondary"}
                onClick={onLater}
                fullWidth={!tabletUp}
              >
                Later
              </Button>
              {!note && data && (
                <Button onClick={onPullNow} fullWidth={!tabletUp}>
                  Pull now
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
