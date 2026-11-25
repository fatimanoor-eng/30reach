import { LogOut, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { BlipWave } from "../components/blip/BlipPoses";
import { buttonClass } from "../components/button-class";
import { Logo } from "../components/Logo";
import { useProfileNames } from "../features/clients/clients-api";
import { useRestoreClient } from "../features/clients/useRestoreClient";
import { useAuth } from "../lib/auth/auth-context";
import { type ClientSummary, clientPath } from "../lib/client-path";
import { archivedLabel, firstNameFrom } from "../lib/client-rules";
import { ClientMark } from "./ClientMark";
import { ClientMenu } from "./ClientSwitcher";

/**
 * "Pick a client" (Slice 17h; no Figma frame yet, built from the switcher and the Add client shell).
 * Shown by LastClientRedirect only when there's no last client to open: a first visit, or your last client
 * was archived or deleted. Everyone else goes straight to their last client, as before.
 *
 * The list is the switcher's own (logo / initials, name, last pull or DEMO, search from 6 clients);
 * archived clients aren't offered. "+ Add client" is a button at the card's top right (UI fixes, 25 Nov).
 * Picking opens that client: a plain visit opens its Overview, an old link (e.g. /ideas?idea=…) keeps its
 * page. The client is remembered (profile + this browser) when its page opens (useRememberClient).
 *
 * No active client at all (`noActive`, UI fixes 25 Nov): every client archived, or none yet. Instead of
 * sending you to Add client (whose Close had nowhere to go), the same card says so, lists the archived
 * clients with Restore, and keeps Settings and Sign out in reach.
 * Tablet / desktop: a centred card. Phones: the same content full screen.
 */
export function PickClientPage({
  archivedName,
  noActive,
}: {
  archivedName?: string | null;
  /** Every client there is, when none is active (archived ones get Restore). */
  noActive?: ClientSummary[];
}) {
  const { pathname, search, hash, state } = useLocation();
  const page = pathname === "/" ? "/overview" : pathname;
  const hrefFor = (slug: string) => `${clientPath(slug, page)}${search}${hash}`;
  // An archived client's own link sends a notice along (AppShell); our own line says the same thing.
  const notice = (state as { notice?: string } | null)?.notice;
  const archived = noActive?.filter((c) => c.archived_at) ?? [];

  const title = !noActive
    ? "Pick a client"
    : archived.length
      ? "No active clients"
      : "Add your first client";
  const line = noActive
    ? archived.length
      ? "Every client is archived. Restore one to carry on, or add a new client."
      : "There are no clients yet. Add one to start."
    : archivedName
      ? `${archivedName} is archived. Choose another client to carry on.`
      : (notice ?? "Choose who you’re working on. You can switch any time from the client menu.");

  const addClient = (
    <Link
      to="/add-client"
      className={buttonClass(noActive && !archived.length ? "primary" : "secondary", "px-3")}
    >
      <Plus size={16} aria-hidden="true" />
      Add client
    </Link>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-bg md:bg-bg">
      <header className="flex h-14 items-center justify-between border-b border-line bg-bg px-4 md:h-16 md:bg-surface md:px-6 xl:px-8">
        <Logo className="h-6 w-auto" />
        <div className="-mr-1 md:hidden">{addClient}</div>
      </header>
      <main className="flex flex-1 justify-center md:items-start md:px-6 md:py-12">
        <section
          aria-labelledby="pick-client-title"
          className="relative flex w-full flex-col px-4 pt-6 pb-8 md:max-w-[480px] md:rounded-card md:border md:border-line md:bg-surface md:p-6"
        >
          {/* Tablet / desktop: the card's top right. Phones (no card): the top bar. */}
          <div className="absolute top-5 right-5 hidden md:block">{addClient}</div>
          <BlipWave className="mx-auto h-auto w-20 md:w-24" />
          <h1 id="pick-client-title" className="mt-3 text-center text-heading md:text-heading-md">
            {title}
          </h1>
          <p className="mt-2 text-center text-body-sm text-muted">{line}</p>
          <div className="mt-6">
            {noActive ? (
              <>
                {archived.length > 0 && <RestoreList clients={archived} />}
                <AccountLinks />
              </>
            ) : (
              <ClientMenu variant="page" onPick={() => {}} hrefFor={hrefFor} />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/** "Restore an archived client": newest archive first, "Archived N days ago · Fatima", Restore. */
function RestoreList({ clients }: { clients: ClientSummary[] }) {
  const { restore, pendingId, failed } = useRestoreClient();
  const names = useProfileNames(
    clients.map((c) => c.archived_by).filter((id): id is string => !!id),
  );
  const [now] = useState(() => new Date());
  const sorted = [...clients].sort((a, b) =>
    (b.archived_at ?? "").localeCompare(a.archived_at ?? ""),
  );
  return (
    <section aria-labelledby="restore-title">
      <h2 id="restore-title" className="px-2.5 pb-1.5 mono-label text-muted">
        Restore an archived client
      </h2>
      <ul aria-label="Archived clients" className="flex flex-col gap-1">
        {sorted.map((c) => {
          const who = c.archived_by ? names.data?.get(c.archived_by) : undefined;
          return (
            <li key={c.id} className="flex min-h-14 items-center gap-3 rounded-control px-2.5 py-2">
              <ClientMark client={c} size="lg" className="opacity-50" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body">{c.name}</p>
                <p className="font-mono text-label text-muted">
                  {failed === c.id
                    ? "Couldn’t restore. Please try again."
                    : archivedLabel(c.archived_at!, firstNameFrom(who?.full_name, who?.email), now)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => restore(c)}
                disabled={pendingId !== null}
                aria-label={`Restore ${c.name}`}
                className="inline-flex min-h-11 shrink-0 items-center rounded-control px-2 text-body-sm font-medium text-blue hover:underline disabled:opacity-40 md:min-h-10"
              >
                {pendingId === c.id ? "Restoring…" : "Restore"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Settings (team, demo client, account) and Sign out stay in reach without a client. */
function AccountLinks() {
  const { signOut } = useAuth();
  const row =
    "flex min-h-12 w-full items-center gap-3 rounded-control px-2.5 text-left text-body hover:bg-bg";
  return (
    <>
      <div aria-hidden="true" className="-mx-2 my-2 h-px bg-line" />
      <Link to="/settings" className={row}>
        <Settings size={18} aria-hidden="true" className="shrink-0" />
        Settings
      </Link>
      <button type="button" onClick={() => void signOut()} className={row}>
        <LogOut size={18} aria-hidden="true" className="shrink-0" />
        Sign out
      </button>
    </>
  );
}
