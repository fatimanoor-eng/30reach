import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { clientPath, type ClientSummary } from "../../lib/client-path";
import { invalidateClient, markRestored, setArchived } from "./clients-api";

/**
 * Restore an archived client from outside the app shell (UI fixes, 25 Nov): the "No active clients"
 * page and Add client's "this site belongs to an archived client" note. It opens the client's
 * Overview with "{Client} restored" (LocationNotice). Inside the shell, ClientActionsProvider restores.
 */
export function useRestoreClient(onDone?: () => void) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function restore(client: Pick<ClientSummary, "id" | "slug" | "name">) {
    setPendingId(client.id);
    setFailed(null);
    try {
      await setArchived(client.id, false, null);
    } catch {
      setFailed(client.id);
      setPendingId(null);
      return;
    }
    markRestored(queryClient, client);
    invalidateClient(queryClient, client.id);
    onDone?.();
    navigate(clientPath(client.slug, "/overview"), {
      state: { notice: `${client.name} restored` },
    });
  }

  return {
    restore: (c: Pick<ClientSummary, "id" | "slug" | "name">) => void restore(c),
    pendingId,
    failed,
  };
}
