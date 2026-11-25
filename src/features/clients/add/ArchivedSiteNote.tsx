import type { ClientSummary } from "../../../lib/client-path";
import { useRestoreClient } from "../useRestoreClient";
import { clearFlow } from "./add-client-state";

/**
 * A website that belongs to an archived client (UI fixes, 25 Nov). It used to block like an active
 * client's site, and its "Open it" link bounced back to Add client. Now it doesn't block: you can add a
 * new client for it, or Restore the archived one (which keeps its posts, ideas and calendar).
 */
export function ArchivedSiteNote({
  client,
  host,
  className = "",
}: {
  client: ClientSummary;
  host: string;
  className?: string;
}) {
  const { restore, pendingId, failed } = useRestoreClient(clearFlow);
  return (
    <p className={`text-small text-muted ${className}`}>
      {failed
        ? `Couldn’t restore ${client.name}. Please try again. `
        : `${client.name} (archived) uses ${host}. Restore it to keep its posts and ideas, or carry on to add a new client. `}
      <button
        type="button"
        onClick={() => restore(client)}
        disabled={!!pendingId}
        className="inline-flex min-h-11 items-center font-medium text-blue hover:underline disabled:opacity-40 md:min-h-0"
      >
        {pendingId ? "Restoring…" : `Restore ${client.name}`}
      </button>
    </p>
  );
}
