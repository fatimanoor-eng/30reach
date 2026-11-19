import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/toast-context";
import { bulkDeleteToast, UNDO_MS, type Idea } from "./idea-rules";
import { deleteIdeas, restoreIdeas, type DeletedIdeas } from "./ideas-api";
import { cancelImageDeletes, finishImageDeletes, holdImageDeletes } from "./pending-image-deletes";

/**
 * Idea board Select mode: "N selected · Cancel · Delete N ideas", sticky at the bottom of the screen
 * (above the phone tabs). Delete → shared confirm → delete_ideas (the database deletes only ideas
 * this person may delete) → "Deleted N ideas · Undo" for ~10 s. Undo puts them all back
 * (restore_ideas, all or nothing); images are removed only once the toast has gone.
 */
export function SelectBar({
  selected,
  selectableCount,
  onSelectAll,
  onCancel,
  onDeleted,
}: {
  selected: Idea[];
  /** How many shown ideas this person may delete (for "Select all"). */
  selectableCount: number;
  onSelectAll: () => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const n = selected.length;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["ideas"] });
    void queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
  };

  const remove = useMutation({
    mutationFn: () => deleteIdeas(selected),
    onSuccess: (result) => {
      setConfirmOpen(false);
      onDeleted();
      refresh();
      offerUndo(result);
    },
  });

  function offerUndo(result: DeletedIdeas) {
    const { snapshots, imagePaths, skipped } = result;
    if (snapshots.length === 0) {
      toast.show({ ...bulkDeleteToast(0, skipped), title: "Nothing was deleted", pose: "idle" });
      return;
    }
    holdImageDeletes(imagePaths);
    const undo = async () => {
      cancelImageDeletes(imagePaths);
      try {
        await restoreIdeas(snapshots);
        refresh();
        toast.show({
          title:
            snapshots.length === 1 ? "Restored the idea" : `Restored ${snapshots.length} ideas`,
          pose: "success",
        });
      } catch {
        void finishImageDeletes(imagePaths);
        toast.show({ title: "Couldn’t undo. The ideas stay deleted.", pose: "error" });
      }
    };
    toast.show({
      ...bulkDeleteToast(snapshots.length, skipped),
      pose: "success",
      durationMs: UNDO_MS,
      action: { label: "Undo", onClick: () => void undo() },
      onDismiss: (reason) => {
        if (reason !== "action") void finishImageDeletes(imagePaths);
      },
    });
  }

  return (
    <>
      <div data-select-bar className="sticky bottom-24 z-30 md:bottom-4">
        <div
          role="toolbar"
          aria-label="Selected ideas"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 shadow-lg"
        >
          <p className="text-body-sm font-medium" aria-live="polite">
            {n === 0 ? "Select ideas to delete" : n === 1 ? "1 selected" : `${n} selected`}
          </p>
          {selectableCount > n && (
            <button
              type="button"
              onClick={onSelectAll}
              className="min-h-11 text-small font-medium text-blue hover:underline md:min-h-0"
            >
              Select all you can delete ({selectableCount})
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 size={16} aria-hidden="true" />}
              disabled={n === 0}
              onClick={() => {
                remove.reset();
                setConfirmOpen(true);
              }}
            >
              {n <= 1 ? "Delete idea" : `Delete ${n} ideas`}
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !remove.isPending && setConfirmOpen(false)}
        title={n === 1 ? "Delete this idea?" : `Delete ${n} ideas?`}
        description="Their comments go with them. Calendar cards made from them stay. You can undo for a few seconds."
        confirmLabel={
          remove.isPending ? "Deleting…" : n === 1 ? "Delete idea" : `Delete ${n} ideas`
        }
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      >
        {remove.isError && (
          <p role="alert" className="text-center text-small text-spark-text">
            Couldn’t delete them. Check your connection and try again.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
