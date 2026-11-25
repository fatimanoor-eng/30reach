import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { LoadError } from "../components/LoadError";
import { useProfile } from "../lib/auth/useProfile";
import { clientPath, lastClientChoice } from "../lib/client-path";
import { readStoredSlug, useClients } from "../lib/useClient";
import { NoClientSettings } from "./NoClientSettings";
import { PickClientPage } from "./PickClientPage";

/**
 * "/" and every address without a client (/overview, /ideas?idea=…, sign-in redirects, old bookmarks)
 * → the same page for your last client (Slice 17b): profile (any device) → this browser. No last client
 * (first visit), or it was archived / deleted → "Pick a client" (17h). No active client → the same page
 * saying so (Restore, Add client, Settings, Sign out); /settings then opens team Settings without a client.
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

  const choice = lastClientChoice(clients.data, {
    profileClientId: profile.data?.last_client_id,
    storedSlug: readStoredSlug(),
  });
  // No active client at all (all archived, or none yet): say so here, with Restore, Add client, Settings
  // and Sign out (UI fixes, 25 Nov). Nothing redirects, so Add client's Close always has somewhere to go.
  if (choice.kind === "none") {
    if (pathname === "/settings") return <NoClientSettings />;
    return <PickClientPage noActive={clients.data} />;
  }
  if (choice.kind === "pick") return <PickClientPage archivedName={choice.archived?.name} />;
  const client = choice.client;
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
