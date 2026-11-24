import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { LoadError } from "../components/LoadError";
import { useProfile } from "../lib/auth/useProfile";
import { clientPath, pickLastClient } from "../lib/client-path";
import { readStoredSlug, useClients } from "../lib/useClient";

/**
 * "/" and every address without a client (/overview, /ideas?idea=…, sign-in redirects, old bookmarks)
 * → the same page for your last client (Slice 17b): profile (any device) → this browser → first A–Z.
 */
export function LastClientRedirect() {
  const location = useLocation();
  const { pathname, search, hash } = location;
  const clients = useClients();
  const profile = useProfile();

  if (clients.isError) {
    return (
      <Shell>
        <LoadError title="Clients didn’t load" onRetry={() => void clients.refetch()} />
      </Shell>
    );
  }
  // Wait for the profile too (a failed profile read falls back to this browser's client).
  if (!clients.data || profile.isPending)
    return <div className="min-h-dvh bg-bg" aria-busy="true" />;

  const client = pickLastClient(clients.data, {
    profileClientId: profile.data?.last_client_id,
    storedSlug: readStoredSlug(),
  });
  // No active client at all (all archived, or none yet): Add client (Slice 17c).
  if (!client) return <Navigate to="/add-client" replace state={location.state} />;
  const page = pathname === "/" ? "/overview" : pathname;
  // The state carries a notice along (e.g. "{Client} is archived…", LocationNotice).
  return (
    <Navigate
      to={`${clientPath(client.slug, page)}${search}${hash}`}
      replace
      state={location.state}
    />
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="mx-auto min-h-dvh max-w-xl bg-bg px-4 py-16">{children}</main>;
}
