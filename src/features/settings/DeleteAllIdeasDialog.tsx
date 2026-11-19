import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { TextField } from "../../components/TextField";
import { useToast } from "../../components/toast-context";
import { finishImageDeletes, holdImageDeletes } from "../ideas/pending-image-deletes";
import { DeleteAllError, deleteAllIdeas } from "./settings-api";

/**
 * "Delete all ideas" (13 › Data, admins): the shared confirm, enabled only once the admin types the
 * number of ideas. delete_all_ideas checks that number again on the server (count_changed if the
 * board changed meanwhile). Comments go with the ideas; calendar cards stay without the link; the
 * images are removed right after (any that fail are retried on the next visit). No Undo.
 */
export function DeleteAllIdeasDialog({
  open,
  onClose,
  clientId,
  count,
  onCountChanged,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  count: number;
  onCountChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim() === String(count);

  async function run() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { deleted, imagePaths } = await deleteAllIdeas(clientId, count);
      // Listed first, so a closed tab doesn't leave images behind (swept on the next visit).
      holdImageDeletes(imagePaths);
      void finishImageDeletes(imagePaths);
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
      void queryClient.invalidateQueries({ queryKey: ["usage_sizes"] });
      onClose();
      toast.show({
        title: `Deleted all ${deleted} ${deleted === 1 ? "idea" : "ideas"}`,
        detail: "Calendar cards made from them stay.",
        pose: "success",
      });
    } catch (e) {
      if (e instanceof DeleteAllError && e.reason === "count_changed") {
        setTyped("");
        onCountChanged();
        setError(
          `The board changed: it has ${e.current ?? "a different number of"} ideas now. Type the new number.`,
        );
      } else if (e instanceof DeleteAllError && e.reason === "not_admin") {
        setError("Only admins can delete all ideas.");
      } else {
        setError("Couldn’t delete them. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={() => !busy && onClose()}
      title={`Delete all ${count} ideas?`}
      description="Every idea goes for the whole team, with its comments and images. Calendar cards made from ideas stay, without the link. This can’t be undone."
      confirmLabel={busy ? "Deleting…" : `Delete ${count} ideas`}
      disabled={!matches}
      busy={busy}
      onConfirm={() => void run()}
    >
      <TextField
        label={`Type ${count} to confirm`}
        inputMode="numeric"
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void run();
          }
        }}
        className="text-left"
      />
      {error && (
        <p role="alert" className="text-center text-small text-spark-text">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
