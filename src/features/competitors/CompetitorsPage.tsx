import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "../../app/PageHeader";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { LoadError } from "../../components/LoadError";
import { Bone, Skeleton } from "../../components/Skeleton";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ModalPresence } from "../../components/ModalPresence";
import { useToast } from "../../components/toast-context";
import { useBrandSelection } from "../../lib/brand-selection-context";
import { plural } from "../../lib/format";
import {
  isPlatform,
  type Platform,
  PLATFORM_ICON,
  STATUS_KEY,
  TARGET_KEY,
} from "../../lib/platforms";
import { useClient } from "../../lib/useClient";
import { type Competitor, useCompetitors } from "../../lib/useCompetitors";
import { usePullPosts, useSavedPulls } from "../overview/useOverviewData";
import { usePull } from "../pulls/pull-context";
import {
  competitorStatus,
  PLATFORM_NAME,
  PLATFORMS,
  targetDisplay,
  targetNoun,
} from "./competitor-rules";
import { CompetitorPanel } from "./CompetitorPanel";
import { removeCompetitor } from "./competitors-api";

const handleKey = (p: Platform) => TARGET_KEY[p];
const statusKey = (p: Platform) => STATUS_KEY[p];
const PULL_BUSY = "Wait for the pull to finish";

/**
 * 07 Competitors: the brands 30reach pulls for this client. Add / Edit open the 07b panel
 * (`?add=1`, `?edit=<id>[&focus=tiktok|linkedin|facebook]` — the 05g "Fix handle" toast links here).
 * Remove → 07c confirm.
 * Desktop (≥ 1200 px): table as in Figma. Below: cards (2 columns on tablet, 1 on mobile).
 */
export function CompetitorsPage() {
  const client = useClient();
  const competitors = useCompetitors();
  const saved = useSavedPulls();
  const latestPosts = usePullPosts(saved.data?.latest?.id);
  const [params, setParams] = useSearchParams();
  // `removing` stays set while the confirm closes, so its text doesn't change mid-animation.
  const [removing, setRemoving] = useState<Competitor | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
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
  const focus = isPlatform(focusParam) ? focusParam : undefined;
  const panelOpen = adding || !!editing;
  // The panel being shown, kept while it slides out (the URL is already cleared by then).
  const panelKey = adding ? "new" : (editing?.id ?? null);
  const [panel, setPanel] = useState<{ key: string; competitor: Competitor | null } | null>(null);
  if (panelKey && panelKey !== panel?.key) setPanel({ key: panelKey, competitor: editing });

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
    setRemoveOpen(false);
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
        <LoadError
          title="Competitors didn’t load"
          onRetry={() => void Promise.all([competitors.refetch(), client.refetch()])}
        />
      </>
    );
  }
  if (!competitors.data || !client.data) {
    return (
      <>
        {header}
        <CompetitorsSkeleton />
      </>
    );
  }

  // ── pieces (render helpers, not components)
  const handleCell = (c: Competitor, p: Platform) => {
    const h = c[handleKey(p)];
    const Icon = PLATFORM_ICON[p];
    if (!h)
      return (
        <span className="text-muted">
          —
          <span className="sr-only">
            No {PLATFORM_NAME[p]} {targetNoun(p)}
          </span>
        </span>
      );
    const bad = c[statusKey(p)] === "not_found";
    return (
      <span
        className={`inline-flex min-w-0 items-center gap-1.5 font-mono text-small ${bad ? "text-spark" : ""}`}
      >
        <Icon size={14} aria-label={PLATFORM_NAME[p]} className="shrink-0 text-muted" />
        <span
          className="truncate"
          title={targetNoun(p) === "page" ? targetDisplay(p, h) : undefined}
        >
          {targetNoun(p) === "page"
            ? targetDisplay(p, h).replace(/^(linkedin\.com\/company|facebook\.com)\//, "")
            : `@${h}`}
        </span>
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
          setRemoveOpen(true);
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
            text="Each brand needs an Instagram, TikTok or X handle or a LinkedIn or Facebook page. 30reach checks it when you save."
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
                    LinkedIn
                  </th>
                  <th scope="col" className="py-4 font-normal">
                    Facebook
                  </th>
                  <th scope="col" className="py-4 font-normal">
                    X
                  </th>
                  <th scope="col" className="py-4 pr-4 font-normal">
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
                    <td className="max-w-56 py-4 pr-4">{handleCell(c, "linkedin")}</td>
                    <td className="max-w-56 py-4 pr-4">{handleCell(c, "facebook")}</td>
                    <td className="max-w-56 py-4 pr-4">{handleCell(c, "x")}</td>
                    <td className="py-4 pr-4 text-body">{posts(c)}</td>
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
            Each brand adds to every pull’s credit cost. 30reach checks handles and pages on save
            and flags any it can’t find.
          </p>
        </div>
      </aside>

      {/* ModalPresence: the drawer slides out before it unmounts. */}
      <ModalPresence open={panelOpen}>
        {panel && (
          <CompetitorPanel
            key={panel.key}
            open
            onClose={closePanel}
            competitor={panel.competitor}
            competitors={list}
            clientId={client.data.id}
            focus={focus}
          />
        )}
      </ModalPresence>

      <ConfirmDialog
        open={removeOpen}
        onClose={() => !removeBusy && setRemoveOpen(false)}
        title={`Remove ${removing?.name ?? ""}?`}
        description={`${removing?.name ?? "This brand"}’s saved posts will disappear from the dashboards and won’t be pulled again. Ideas saved from its posts stay on the idea board.`}
        confirmLabel={removeBusy ? "Removing…" : `Remove ${removing?.name ?? ""}`}
        busy={removeBusy}
        disabled={pullBusy}
        onConfirm={() => void confirmRemove()}
      >
        {(removeError || pullBusy) && (
          <p role="alert" className="text-center text-small text-spark">
            {removeError ?? `${PULL_BUSY}, then remove.`}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

/** Loading, in the real shape: the 07 table from 1200 px, brand cards below (2 columns on tablet). */
function CompetitorsSkeleton() {
  const rows = [0, 1, 2, 3, 4, 5];
  return (
    <Skeleton label="Loading competitors">
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface xl:block">
        <div className="flex gap-6 border-b border-line px-6 py-4">
          {["w-16", "w-20", "w-16", "w-20", "w-20", "w-24", "w-14"].map((w, i) => (
            <Bone key={i} className={`h-2.5 ${w} ${i === 0 ? "mr-24" : "mr-10"}`} />
          ))}
        </div>
        {rows.map((i) => (
          <div
            key={i}
            className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr_0.8fr] items-center gap-4 border-b border-line px-6 py-4 last:border-0"
          >
            <div className="flex items-center gap-3">
              <Bone className="size-8 shrink-0 rounded-full" />
              <Bone className="h-3.5 w-28" />
            </div>
            <Bone className="h-3.5 w-28" />
            <Bone className="h-3.5 w-24" />
            <Bone className="h-3.5 w-10" />
            <Bone className="h-5.5 w-16 rounded-full" />
            <Bone className="ml-auto h-3.5 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 md:gap-4 xl:hidden">
        {rows.slice(0, 4).map((i) => (
          <div key={i} className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Bone className="size-9 rounded-full" />
                <Bone className="h-3.5 w-28" />
              </div>
              <Bone className="h-5.5 w-16 rounded-full" />
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {["w-32", "w-28", "w-10"].map((w, j) => (
                <div key={j} className="flex items-center gap-4">
                  <Bone className="h-2.5 w-20" />
                  <Bone className={`h-3 ${w}`} />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-4 border-t border-line pt-3">
              <Bone className="h-3.5 w-8" />
              <Bone className="h-3.5 w-14" />
            </div>
          </div>
        ))}
      </div>
    </Skeleton>
  );
}
