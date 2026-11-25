import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { BlipThinking } from "../../components/blip/BlipPoses";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ModalPresence } from "../../components/ModalPresence";
import { ResponsiveDialog } from "../../components/ResponsiveDialog";
import { TextField } from "../../components/TextField";
import { useToast } from "../../components/toast-context";
import { useAuth } from "../../lib/auth/auth-context";
import { type ClientSummary, clientPath } from "../../lib/client-path";
import { countsSentence, deleteConfirmMatches, landingAfterArchive } from "../../lib/client-rules";
import { readStoredSlug, useClient, useClients } from "../../lib/useClient";
import { usePull } from "../pulls/pull-context";
import { ClientActionsContext } from "./client-actions";
import {
  DeleteClientError,
  deleteClient,
  invalidateClient,
  markRestored,
  setArchived,
  useClientCounts,
} from "./clients-api";

/**
 * Archive / restore / permanent delete for the whole shell (Slice 17c). Archiving sends you to your last
 * other client (or the "No active clients" page when none is left) with "{Client} archived · Undo"; restoring opens it
 * again; deleting (archived clients only) goes through `delete-client`.
 */
export function ClientActionsProvider({ children }: { children: ReactNode }) {
  const [archiving, setArchiving] = useState<ClientSummary | null>(null);
  const [deleting, setDeleting] = useState<ClientSummary | null>(null);
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const clients = useClients();
  const current = useClient().data;

  const restore = useCallback(
    async (client: ClientSummary) => {
      try {
        await setArchived(client.id, false, null);
      } catch {
        toast.show({
          title: `Couldn’t restore ${client.name}`,
          detail: "Please try again.",
          pose: "error",
        });
        return;
      }
      markRestored(queryClient, client);
      invalidateClient(queryClient, client.id);
      navigate(clientPath(client.slug, "/overview"));
      toast.show({ title: `${client.name} restored`, pose: "success" });
    },
    [navigate, queryClient, toast],
  );

  const archive = useCallback(
    async (client: ClientSummary) => {
      await setArchived(client.id, true, user?.id ?? null);
      setArchiving(null);
      const landing = landingAfterArchive(clients.data ?? [], client.id, readStoredSlug());
      // The last active client: "/" says "No active clients" (Restore / Add client), UI fixes 25 Nov.
      navigate(landing ? clientPath(landing.slug, "/overview") : "/");
      invalidateClient(queryClient, client.id);
      toast.show({
        title: `${client.name} archived`,
        pose: "idle",
        action: { label: "Undo", onClick: () => void restore(client) },
      });
    },
    [clients.data, navigate, queryClient, restore, toast, user?.id],
  );

  const api = useMemo(
    () => ({
      requestArchive: (c: ClientSummary) => setArchiving(c),
      restore: (c: ClientSummary) => void restore(c),
      requestDelete: (c: ClientSummary) => setDeleting(c),
    }),
    [restore],
  );

  return (
    <ClientActionsContext value={api}>
      {children}
      <ModalPresence open={!!archiving}>
        {archiving && (
          <ArchiveDialog
            client={archiving}
            isCurrent={archiving.id === current?.id}
            onClose={() => setArchiving(null)}
            onArchive={archive}
          />
        )}
      </ModalPresence>
      <ModalPresence open={!!deleting}>
        {deleting && (
          <DeleteClientDialog
            client={deleting}
            onClose={() => setDeleting(null)}
            onDeleted={(name) => {
              setDeleting(null);
              invalidateClient(queryClient);
              toast.show({ title: `${name} deleted.`, pose: "idle" });
            }}
          />
        )}
      </ModalPresence>
    </ClientActionsContext>
  );
}

/** 16b: confirm pattern, centred; ink (archiving is reversible). Disabled while this client pulls. */
function ArchiveDialog({
  client,
  isCurrent,
  onClose,
  onArchive,
}: {
  client: ClientSummary;
  isCurrent: boolean;
  onClose: () => void;
  onArchive: (c: ClientSummary) => Promise<void>;
}) {
  const pull = usePull();
  const pulling = isCurrent && pull.state.kind !== "idle";
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <ResponsiveDialog
      open
      onClose={() => !busy && onClose()}
      align="center"
      illustrationSize="sm"
      illustration={<BlipThinking className="h-auto w-full" />}
      title={`Archive ${client.name}?`}
      description={`${client.name} leaves the switcher and nothing is pulled for it. Posts, ideas, calendar cards and settings are kept. Restore it any time from Archived.`}
      primary={{
        label: "Archive",
        disabled: busy || pulling,
        onClick: () => {
          setBusy(true);
          setFailed(false);
          onArchive(client).catch(() => {
            setBusy(false);
            setFailed(true);
          });
        },
      }}
    >
      {(pulling || failed) && (
        <p role="alert" className="text-center text-small text-muted">
          {pulling ? "Wait for the pull to finish." : "Couldn’t archive. Please try again."}
        </p>
      )}
    </ResponsiveDialog>
  );
}

/** 16d: red, permanent. Type the client's name; counts from the database when it opens. */
function DeleteClientDialog({
  client,
  onClose,
  onDeleted,
}: {
  client: ClientSummary;
  onClose: () => void;
  onDeleted: (name: string) => void;
}) {
  const counts = useClientCounts(client.id, true);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = deleteConfirmMatches(typed, client.name);
  const description = counts.data
    ? countsSentence(counts.data)
    : counts.isError
      ? "This deletes everything saved for this client and removes their images from storage. Usage history keeps the name. This can’t be undone."
      : "Counting what this deletes…";
  return (
    <ConfirmDialog
      open
      onClose={() => !busy && onClose()}
      title={`Delete ${client.name} permanently?`}
      description={description}
      confirmLabel="Delete permanently"
      busy={busy}
      disabled={!matches}
      onConfirm={() => {
        setBusy(true);
        setError(null);
        deleteClient(client.id, typed)
          .then((r) => onDeleted(r.name))
          .catch((e) => {
            setBusy(false);
            setError(
              e instanceof DeleteClientError && e.code === "running"
                ? "A pull is running for this client. Try again when it’s done."
                : e instanceof DeleteClientError && e.code === "not_archived"
                  ? "Archive this client first."
                  : "Couldn’t delete. Nothing was removed; please try again.",
            );
          });
      }}
    >
      <div className="text-left">
        <TextField
          label={`Type ${client.name} to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          data-autofocus
        />
        {error && (
          <p role="alert" className="mt-2 text-small text-spark-text">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
