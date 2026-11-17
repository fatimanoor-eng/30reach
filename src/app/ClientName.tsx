import { useClient } from "../lib/useClient";

/**
 * The current client's name from the `clients` table (never sample data). While it loads: a small
 * skeleton bar sized like a short name; if it fails: nothing (the page shows its own error state).
 */
export function ClientName({ skeletonClassName = "bg-sidebar-2" }: { skeletonClassName?: string }) {
  const client = useClient();
  if (client.data) return <>{client.data.name}</>;
  if (client.isError) return null;
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[1em] w-20 rounded-sm align-middle motion-safe:animate-pulse ${skeletonClassName}`}
    />
  );
}
