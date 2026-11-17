import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "../../app/PageHeader";
import { Avatar } from "../../components/Avatar";
import { BlipError, BlipIdle } from "../../components/blip/BlipPoses";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { InstagramIcon, TikTokIcon } from "../../components/icons/BrandIcons";
import { ResponsiveDialog } from "../../components/ResponsiveDialog";
import { useToast } from "../../components/toast-context";
import { useBrandSelection } from "../../lib/brand-selection-context";
import { plural } from "../../lib/format";
import type { Platform } from "../../lib/pulls/api";
import { useClient } from "../../lib/useClient";
import { type Competitor, useCompetitors } from "../../lib/useCompetitors";
import { usePullPosts, useSavedPulls } from "../overview/useOverviewData";
import { usePull } from "../pulls/pull-context";
import { competitorStatus, PLATFORM_NAME, PLATFORMS } from "./competitor-rules";
import { CompetitorPanel } from "./CompetitorPanel";
import { removeCompetitor } from "./competitors-api";

const handleKey = (p: Platform) => (p === "instagram" ? "instagram_handle" : "tiktok_handle");
const statusKey = (p: Platform) => (p === "instagram" ? "instagram_status" : "tiktok_status");
const PULL_BUSY = "Wait for the pull to finish";

/**
 * 07 Competitors: the brands 30reach pulls for this client. Add / Edit open the 07b panel
 * (`?add=1`, `?edit=<id>[&focus=tiktok]` — the 05g "Fix handle" toast links here). Remove → 07c confirm.
 * Desktop (≥ 1200 px): table as in Figma. Below: cards (2 columns on tablet, 1 on mobile).
 */
export function CompetitorsPage() {
  const client = useClient();
  const competitors = useCompetitors();
  const saved = useSavedPulls();
  const latestPosts = usePullPosts(saved.data?.latest?.id);
  const [params, setParams] = useSearchParams();
  const [removing, setRemoving] = useState<Competitor | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { selected, toggle } = useBrandSelection();
  const pullBusy = usePull().state.kind !== "idle";

  const list = competitors.data ?? [];
  const editId = params.get("edit");
  const adding = params.get("add") === "1";
  const editing = editId ? (list.find((c) => c.id === editId) ?? null) : null;
  const focusParam = params.get("focus");
  const focus = focusParam === "instagram" || focusParam === "tiktok" ? focusParam : undefined;
  const panelOpen = adding || !!editing;

  const openPanel = (next: Record<string, string>) => setParams(next);
  const closePanel = () => setParams({}, { replace: true });

  const postCount = (id: string) =>
    latestPosts.data ? latestPosts.data.filter((p) => p.competitor_id === id).length : null;

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await removeCompetitor(removing.id);
    } catch {
      setRemoveError("Couldn’t remove it. Check your connection and try again.");
      setRemoveBusy(false);
      return;
    }
    if (selected.includes(removing.id)) toggle(removing.id); // don't leave dashboards filtered to it
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["competitors"] }),
      queryClient.invalidateQueries({ queryKey: ["posts"] }),
    ]);
    toast.show({
      title: `Removed ${removing.name}`,
      detail: "Its posts are gone from the dashboards. Ideas from its posts stay.",
      pose: "success",
    });
    setRemoveBusy(false);
    setRemoving(null);
  };

  const header = (
    <PageHeader
      title="Competitors"
      description={
        competitors.data
          ? `${plural(list.length, "brand")} tracked. Changes apply on the next Refresh.`
          : "Changes apply on the next Refresh."
      }
      actions={
        <Button
          icon={<Plus size={16} aria-hidden="true" />}
          onClick={() => openPanel({ add: "1" })}
        >
          Add competitor
        </Button>
      }
    />
  );

  if (competitors.isError || client.isError) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            label="Couldn’t load"
            title="Competitors didn’t load"
            text="Check your connection and try again. Nothing was changed."
            actions={
              <Button
                variant="secondary"
                onClick={() => void Promise.all([competitors.refetch(), client.refetch()])}
              >
                Try again
              </Button>
            }
          />
        </Card>
      </>
    );
  }
  if (!competitors.data || !client.data) {
    return (
      <>
        {header}
        <div
          aria-busy="true"
          aria-label="Loading competitors"
          className="flex h-72 items-center justify-center rounded-card bg-soft motion-safe:animate-pulse"
        >
          <BlipIdle className="h-auto w-16 opacity-60" />
        </div>
      </>
    );
  }

  // ── pieces (render helpers, not components)
  const handleCell = (c: Competitor, p: Platform) => {
    const h = c[handleKey(p)];
    const Icon = p === "instagram" ? InstagramIcon : TikTokIcon;
    if (!h)
      return (
        <span className="text-muted">
          —<span className="sr-only">No {PLATFORM_NAME[p]} handle</span>
        </span>
      );
    const bad = c[statusKey(p)] === "not_found";
    return (
      <span
        className={`inline-flex min-w-0 items-center gap-1.5 font-mono text-small ${bad ? "text-spark" : ""}`}
      >
        <Icon size={14} aria-label={PLATFORM_NAME[p]} className="shrink-0 text-muted" />
        <span className="truncate">@{h}</span>
        {bad && <span className="sr-only">(not found)</span>}
      </span>
    );
  };
  const statusChip = (c: Competitor) => {
    const s = competitorStatus(c);
    return <Chip tone={s.tone}>{s.label}</Chip>;
  };
  const posts = (c: Competitor) => postCount(c.id) ?? "—";
  const actions = (c: Competitor) => (
    <div className="flex items-center justify-end gap-4">
      <button
        type="button"
        onClick={() => openPanel({ edit: c.id })}
        className="inline-flex min-h-11 min-w-11 items-center justify-center text-body-sm text-blue hover:underline xl:min-h-6"
      >
        Edit<span className="sr-only"> {c.name}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          setRemoveError(null);
          setRemoving(c);
        }}
        disabled={pullBusy}
        title={pullBusy ? PULL_BUSY : undefined}
        className="inline-flex min-h-11 min-w-11 items-center justify-center text-body-sm text-muted hover:text-ink hover:underline disabled:opacity-40 disabled:hover:no-underline xl:min-h-6"
      >
        Remove<span className="sr-only"> {c.name}</span>
      </button>
    </div>
  );

  return (
    <>
      {header}

      {list.length === 0 ? (
        <Card>
          <EmptyState
            label="No brands yet"
            title="Add the competitors to follow"
            text="Each brand needs an Instagram or TikTok handle. 30reach checks it when you save."
            actions={<Button onClick={() => openPanel({ add: "1" })}>Add competitor</Button>}
          />
        </Card>
      ) : (
        <>
          {/* Desktop: table (Figma 07) */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface xl:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line mono-label text-muted">
                  <th scope="col" className="py-4 pl-6 font-normal">
                    Brand
                  </th>
                  <th scope="col" className="py-4 font-normal">
                    Instagram
                  </th>
                  <th scope="col" className="py-4 font-normal">
                    TikTok
                  </th>
                  <th scope="col" className="py-4 font-normal">
                    Posts · 30 days
                  </th>
                  <th scope="col" className="py-4 font-normal">
                    Status
                  </th>
                  <th scope="col" className="py-4 pr-6 font-normal">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <th scope="row" className="py-4 pl-6 font-normal">
                      <span className="flex items-center gap-3 text-body">
                        <Avatar initials={c.initials} size="md" />
                        {c.name}
                      </span>
                    </th>
                    <td className="max-w-56 py-4 pr-4">{handleCell(c, "instagram")}</td>
                    <td className="max-w-56 py-4 pr-4">{handleCell(c, "tiktok")}</td>
                    <td className="py-4 text-body">{posts(c)}</td>
                    <td className="py-4">{statusChip(c)}</td>
                    <td className="py-4 pr-6">{actions(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tablet / mobile: cards */}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 md:gap-4 xl:hidden">
            {list.map((c) => (
              <li key={c.id} className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex min-w-0 items-center gap-3 text-body">
                    <Avatar initials={c.initials} size="md" />
                    <span className="truncate">{c.name}</span>
                  </h2>
                  {statusChip(c)}
                </div>
                <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-small">
                  {PLATFORMS.map((p) => (
                    <div key={p} className="contents">
                      <dt className="mono-label leading-5 text-muted">{PLATFORM_NAME[p]}</dt>
                      <dd className="min-w-0">{handleCell(c, p)}</dd>
                    </div>
                  ))}
                  <dt className="mono-label leading-5 text-muted">Posts · 30 days</dt>
                  <dd>{posts(c)}</dd>
                </dl>
                <div className="mt-2 border-t border-line pt-1">{actions(c)}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      <aside className="mt-6 rounded-card border border-line bg-surface p-4 md:p-6">
        <div className="border-l-3 border-flash pl-4">
          <p className="text-body-sm font-medium">Keep it to 5–8 brands</p>
          <p className="mt-1 text-small text-muted">
            Each brand adds to every pull’s credit cost. 30reach checks handles on save and flags
            any it can’t find.
          </p>
        </div>
      </aside>

      {panelOpen && (
        <CompetitorPanel
          key={editing?.id ?? "new"}
          open
          onClose={closePanel}
          competitor={editing}
          competitors={list}
          clientId={client.data.id}
          focus={focus}
        />
      )}

      <ResponsiveDialog
        open={!!removing}
        onClose={() => !removeBusy && setRemoving(null)}
        illustration={<BlipError className="h-auto w-full" />}
        title={`Remove ${removing?.name ?? ""}?`}
        description={`${removing?.name ?? "This brand"}’s saved posts will disappear from the dashboards and won’t be pulled again. Ideas saved from its posts stay on the idea board.`}
        primary={{
          label: removeBusy ? "Removing…" : `Remove ${removing?.name ?? ""}`,
          variant: "danger",
          disabled: removeBusy || pullBusy,
          onClick: () => void confirmRemove(),
        }}
      >
        {(removeError || pullBusy) && (
          <p role="alert" className="text-small text-spark">
            {removeError ?? `${PULL_BUSY}, then remove.`}
          </p>
        )}
      </ResponsiveDialog>
    </>
  );
}
