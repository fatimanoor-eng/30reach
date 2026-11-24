import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { LoadError } from "../components/LoadError";
import { useProfile } from "../lib/auth/useProfile";
import { clientPath, pickLastClient } from "../lib/client-path";
import { readStoredSlug, useClients } from "../lib/useClient";

/**
 * "/" and every address without a client (/overview, /ideas?idea=…, sign-in redirects, old bookmarks)
 * → the same page for your last client (Slice 17b): profile (any device) → this browser → first A–Z.
 */
export function LastClientRedirect() {
  const { pathname, search, hash } = useLocation();
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
  if (!client) {
    // Only before the first client exists (Add client arrives in 17c).
    return (
      <Shell>
        <Card>
          <EmptyState
            label="Clients"
            title="No clients yet"
            text="There are no clients to show yet."
          />
        </Card>
      </Shell>
    );
  }
  const page = pathname === "/" ? "/overview" : pathname;
  return <Navigate to={`${clientPath(client.slug, page)}${search}${hash}`} replace />;
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="mx-auto min-h-dvh max-w-xl bg-bg px-4 py-16">{children}</main>;
}
