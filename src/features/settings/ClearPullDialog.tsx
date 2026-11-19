import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/toast-context";
import { formatShortDate } from "../../lib/format";
import { useClient } from "../../lib/useClient";
import { useSavedPulls } from "../overview/useOverviewData";
import { ClearPullError, useClearPull, usePullPostCounts, type ClearWhich } from "./settings-api";
import { clearChoices } from "./settings-rules";

/**
 * "Clear saved pull?" (13 › Data; 07c confirm pattern): the saved pulls with dates and post counts,
 * and a choice — Latest / Previous / Both — each with what it does. Nothing is picked until the admin
 * picks (unless there's only one pull). `clear-pull` deletes on the server (admins only).
 */
export function ClearPullDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useClient();
  const pulls = useSavedPulls();
  const latest = pulls.data?.latest ?? null;
  const previous = pulls.data?.previous ?? null;
  const counts = usePullPostCounts(
    [latest?.id, previous?.id].filter((x): x is string => !!x),
    open,
  );
  const clear = useClearPull(client.data?.id);
  const toast = useToast();
  const choices = clearChoices(
    latest && {
      date: formatShortDate(latest.started_at) ?? "",
      posts: counts.data?.get(latest.id) ?? null,
    },
    previous && {
      date: formatShortDate(previous.started_at) ?? "",
      posts: counts.data?.get(previous.id) ?? null,
    },
  );
  const [picked, setPicked] = useState<ClearWhich | null>(null);
  const which = choices.length === 1 ? choices[0].which : picked;

  function confirm() {
    if (!which) return;
    const pullId =
      which === "latest" ? latest?.id : which === "previous" ? previous?.id : undefined;
    clear.mutate(
      { which, pullId },
      {
        onSuccess: () => {
          onClose();
          toast.show({
            title:
              which === "both"
                ? "Cleared both saved pulls"
                : which === "latest"
                  ? "Cleared the latest pull"
                  : "Cleared the previous pull",
            detail:
              which === "previous"
                ? "The dashboards are unchanged."
                : which === "latest" && previous
                  ? "The dashboards show the previous pull."
                  : "Press Refresh on the Overview for a new one.",
            pose: "success",
          });
        },
      },
    );
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={() => !clear.isPending && onClose()}
      title="Clear saved pull?"
      description="Choose what to delete, for the whole team. Ideas saved from posts keep their own copy."
      confirmLabel={
        clear.isPending ? "Clearing…" : which === "both" ? "Clear both pulls" : "Clear pull"
      }
      disabled={!which}
      busy={clear.isPending}
      onConfirm={confirm}
    >
      <fieldset className="flex flex-col gap-2 text-left">
        <legend className="sr-only">Which pull to clear</legend>
        {choices.map((c) => (
          <label
            key={c.which}
            className={`flex cursor-pointer items-start gap-3 rounded-control border px-3.5 py-3 ${
              which === c.which ? "border-ink bg-bg" : "border-line hover:border-ink"
            }`}
          >
            <input
              type="radio"
              name="clear-which"
              value={c.which}
              checked={which === c.which}
              onChange={() => setPicked(c.which)}
              className="mt-1 size-4 shrink-0 accent-ink"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body-sm font-medium">{c.label}</span>
              <span className="text-small text-muted">{c.effect}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {clear.isError && (
        <p role="alert" className="text-center text-small text-spark-text">
          {clearErrorText(clear.error)}
        </p>
      )}
    </ConfirmDialog>
  );
}

function clearErrorText(err: unknown): string {
  const reason = err instanceof ClearPullError ? err.reason : "failed";
  return {
    running: "A Refresh is running. Try again when it’s done.",
    changed: "The saved pulls changed meanwhile. Close this and open it again.",
    none: "That pull isn’t saved any more.",
    not_admin: "Only admins can clear the saved pull.",
    failed: "Couldn’t clear it. Check your connection and try again.",
  }[reason];
}
