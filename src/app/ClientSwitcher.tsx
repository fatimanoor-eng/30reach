import { Archive, Check, ChevronDown, Plus, Search, SlidersVertical } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { BottomSheet } from "../components/BottomSheet";
import { ModalPresence } from "../components/ModalPresence";
import { Tooltip } from "../components/Tooltip";
import {
  appPathOf,
  type ClientSummary,
  clientPath,
  filterClients,
  lastPullLabel,
  orderClients,
  SEARCH_FROM,
} from "../lib/client-path";
import { useClientActions } from "../features/clients/client-actions";
import { useProfileNames } from "../features/clients/clients-api";
import { archivedLabel, firstNameFrom } from "../lib/client-rules";
import { useClient, useClients, useLastPulls } from "../lib/useClient";
import { ClientMark } from "./ClientMark";

/*
 * Client switcher (Slice 17b; Figma 15a desktop menu, M13 phone sheet; tablet rail = same menu as a
 * popover). Rows: mark · name · last pull (or DEMO), ✓ on the current client; current first, then A–Z;
 * search from 6 clients; "{Client} settings" (Client settings, 16), Add client (15f manual form) and
 * Archived (n) (16c), Slice 17c.
 */

type MenuVariant = "popover" | "sheet";

/** Switching keeps the page you're on (Calendar → the other client's Calendar), without its query. */
function useSwitchTarget() {
  const { pathname } = useLocation();
  const page = appPathOf(pathname);
  return (slug: string) => clientPath(slug, page === "/" ? "/overview" : page);
}

function ClientMenu({ variant, onPick }: { variant: MenuVariant; onPick: () => void }) {
  const clients = useClients();
  const current = useClient().data;
  const lastPulls = useLastPulls();
  const target = useSwitchTarget();
  const [query, setQuery] = useState("");
  const sheet = variant === "sheet";

  const ordered = orderClients(clients.data ?? [], current?.id);
  const shown = filterClients(ordered, query);
  const searchable = ordered.length >= SEARCH_FROM;
  const row = `flex w-full items-center gap-3 rounded-control px-2.5 text-left ${sheet ? "min-h-14 text-body" : "min-h-12 text-body-sm"}`;

  return (
    <div className="on-light flex flex-col">
      {searchable && (
        <label className="mb-2 flex h-11 items-center gap-2 rounded-control bg-bg px-3 text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink md:h-10">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search clients</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            className="min-w-0 flex-1 bg-transparent text-body-sm text-ink outline-none placeholder:text-muted"
          />
        </label>
      )}
      {!sheet && (
        <p className="px-2.5 pt-1 pb-1.5 mono-label text-muted">
          Clients · {clients.data ? ordered.length : "…"}
        </p>
      )}

      {clients.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 px-2.5 py-3 text-body-sm">
          <p className="text-muted">Couldn’t load clients.</p>
          <button
            type="button"
            onClick={() => void clients.refetch()}
            className="min-h-11 font-medium underline md:min-h-0"
          >
            Try again
          </button>
        </div>
      ) : !clients.data ? (
        <ul aria-busy="true" aria-label="Loading clients" className="flex flex-col gap-1">
          {[0, 1, 2].map((i) => (
            <li key={i} className={`${row} pointer-events-none`}>
              <span className="size-8 rounded-[6px] bg-soft motion-safe:animate-pulse" />
              <span className="h-3 w-32 rounded-full bg-soft motion-safe:animate-pulse" />
            </li>
          ))}
        </ul>
      ) : (
        <ul aria-label="Clients" className="flex flex-col gap-1">
          {shown.map((c) => {
            const isCurrent = c.id === current?.id;
            return (
              <li key={c.id}>
                <Link
                  to={target(c.slug)}
                  onClick={onPick}
                  aria-current={isCurrent ? "true" : undefined}
                  className={`${row} ${isCurrent ? "bg-bg" : "hover:bg-bg"}`}
                >
                  <ClientMark client={c} size={sheet ? "lg" : "md"} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.is_demo ? (
                    <span className="rounded-full bg-flash px-2 py-0.5 font-mono text-label text-ink uppercase">
                      Demo
                    </span>
                  ) : (
                    <span className="shrink-0 font-mono text-label text-muted">
                      {lastPulls.data
                        ? lastPullLabel(lastPulls.data.get(c.id), new Date(), { short: sheet })
                        : ""}
                    </span>
                  )}
                  {isCurrent && <Check size={18} aria-hidden="true" className="shrink-0" />}
                </Link>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="px-2.5 py-3 text-body-sm text-muted">No clients match “{query}”.</li>
          )}
        </ul>
      )}

      <div aria-hidden="true" className="-mx-2 my-2 h-px bg-line" />
      {current && (
        <Link
          to={clientPath(current.slug, "/client-settings")}
          onClick={onPick}
          className={`${row} hover:bg-bg`}
        >
          <SlidersVertical size={18} aria-hidden="true" className="shrink-0" />
          {current.name} settings
        </Link>
      )}
      <Link to="/add-client" onClick={onPick} className={`${row} hover:bg-bg`}>
        <Plus size={18} aria-hidden="true" className="shrink-0" />
        Add client
      </Link>
      <ArchivedSection
        clients={(clients.data ?? []).filter((c) => c.archived_at)}
        row={row}
        sheet={sheet}
        onPick={onPick}
      />
    </div>
  );
}

/**
 * 16c: "Archived (n)" expands inside the menu: greyed rows with "Archived N days ago · Fatima", Restore
 * and Delete permanently…. Hidden when nothing is archived. Archived clients never auto-delete.
 */
function ArchivedSection({
  clients,
  row,
  sheet,
  onPick,
}: {
  clients: ClientSummary[];
  row: string;
  sheet: boolean;
  onPick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const actions = useClientActions();
  const names = useProfileNames(
    open ? clients.map((c) => c.archived_by).filter((id): id is string => !!id) : [],
  );
  if (clients.length === 0) return null;
  const sorted = [...clients].sort((a, b) =>
    (b.archived_at ?? "").localeCompare(a.archived_at ?? ""),
  );
  const now = new Date();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`${row} hover:bg-bg`}
      >
        <Archive size={18} aria-hidden="true" className="shrink-0" />
        <span className="flex-1">Archived</span>
        <span className="font-mono text-label text-muted">{clients.length}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul id={listId} aria-label="Archived clients" className="flex flex-col gap-1 pb-1">
          {sorted.map((c) => {
            const who = c.archived_by ? names.data?.get(c.archived_by) : undefined;
            return (
              <li key={c.id} className="flex items-start gap-3 rounded-control px-2.5 py-2">
                <ClientMark client={c} size={sheet ? "lg" : "md"} className="opacity-50" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm text-muted">{c.name}</p>
                  <p className="font-mono text-label text-muted">
                    {archivedLabel(c.archived_at!, firstNameFrom(who?.full_name, who?.email), now)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onPick();
                      actions.requestDelete(c);
                    }}
                    className="-ml-0.5 inline-flex min-h-11 items-center px-0.5 text-small text-spark-text hover:underline md:min-h-7"
                  >
                    Delete permanently…
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onPick();
                    actions.restore(c);
                  }}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-control px-2 text-small font-medium text-blue hover:underline md:min-h-8"
                >
                  Restore
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** Closes on Esc (focus back on the trigger) and on a click outside. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const toggle = () => setOpen((o) => !o);
  const close = () => setOpen(false);
  return { open, toggle, close, wrapRef, triggerRef, panelId };
}

function Panel({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="group"
      aria-label="Switch client"
      className={`absolute z-40 w-78 rounded-card border border-line bg-surface p-2 text-ink shadow-xl ${className}`}
    >
      {children}
    </div>
  );
}

/** Desktop sidebar card (≥ 1200 px): mark + "Client" + name + ⌄ → menu below. */
export function SidebarClientSwitcher() {
  const client = useClient().data;
  const { open, toggle, close, wrapRef, triggerRef, panelId } = usePopover();
  return (
    <div ref={wrapRef} className="relative mt-6">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        aria-label={client ? `Client: ${client.name}. Switch client` : "Switch client"}
        className="flex w-full items-center gap-3 rounded-control bg-sidebar-2 px-3 py-2.5 text-left hover:bg-sidebar-line"
      >
        {client ? (
          <ClientMark client={client} dark />
        ) : (
          <span className="size-8 shrink-0 rounded-[6px] bg-sidebar-line motion-safe:animate-pulse" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block mono-label text-sidebar-text">Client</span>
          <span className="block truncate text-body-sm">
            {client?.name ?? (
              <span className="inline-block h-3 w-24 rounded-full bg-sidebar-line motion-safe:animate-pulse" />
            )}
          </span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-sidebar-text transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <Panel id={panelId} className="top-full left-0 mt-2">
          <ClientMenu variant="popover" onPick={close} />
        </Panel>
      )}
    </div>
  );
}

/** Tablet rail (768–1199 px): the client mark opens the same menu to its right. */
export function RailClientSwitcher() {
  const client = useClient().data;
  const { open, toggle, close, wrapRef, triggerRef, panelId } = usePopover();
  if (!client) {
    // Loading (or not found): same-size placeholder so the rail doesn't jump.
    return (
      <span aria-hidden="true" className="mt-5 size-11 rounded-control p-1.5">
        <span className="block size-8 rounded-[6px] bg-sidebar-2 motion-safe:animate-pulse" />
      </span>
    );
  }
  return (
    <div ref={wrapRef} className="relative mt-5">
      <Tooltip side="right" content={`Client: ${client.name}`} enabled={!open}>
        {(t) => (
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={toggle}
            aria-label={`Client: ${client.name}. Switch client`}
            aria-describedby={t["aria-describedby"]}
            className="inline-flex size-11 items-center justify-center rounded-control hover:bg-sidebar-2"
          >
            <ClientMark client={client} dark />
          </button>
        )}
      </Tooltip>
      {open && (
        <Panel id={panelId} className="top-0 left-full ml-3">
          <ClientMenu variant="popover" onPick={close} />
        </Panel>
      )}
    </div>
  );
}

/** Phone app bar (< 768 px): the client pill opens the Clients sheet (M13). */
export function MobileClientSwitcher() {
  const client = useClient().data;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={client ? `Client: ${client.name}. Switch client` : "Switch client"}
        onClick={() => setOpen(true)}
        className="flex h-11 min-w-0 items-center"
      >
        <span className="flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-sidebar-2 pr-2.5 pl-3.5 text-body-sm">
          <span className="truncate">
            {client?.name ?? (
              <span className="inline-block h-3 w-20 rounded-full bg-sidebar-line motion-safe:animate-pulse" />
            )}
          </span>
          <ChevronDown size={16} className="shrink-0 text-sidebar-text" aria-hidden="true" />
        </span>
      </button>
      <ModalPresence open={open}>
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Clients" cancelLabel={null}>
          <div className="-mx-2">
            <ClientMenu variant="sheet" onPick={() => setOpen(false)} />
          </div>
        </BottomSheet>
      </ModalPresence>
    </>
  );
}
