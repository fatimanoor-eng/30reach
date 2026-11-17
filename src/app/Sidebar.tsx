import { ChevronDown, SlidersVertical } from "lucide-react";
import { Link, NavLink } from "react-router";
import { Avatar } from "../components/Avatar";
import { BlipIdle } from "../components/blip/BlipPoses";
import { CreditsMeter } from "../components/CreditsMeter";
import { Logo } from "../components/Logo";
import { useCurrentUser } from "../lib/auth/useCurrentUser";
import { sampleClient, sampleCredits } from "../lib/sample-data";
import { navSections } from "./nav";

/** Desktop sidebar, 248 px (Figma 6897:126). Shown from 1200 px. */
export function Sidebar({
  onAskBlip,
  className = "",
}: {
  onAskBlip: () => void;
  className?: string;
}) {
  const me = useCurrentUser();
  return (
    <aside
      aria-label="Sidebar"
      className={`on-dark sticky top-0 h-dvh w-62 shrink-0 flex-col bg-sidebar px-4 pt-6 pb-4 text-white ${className}`}
    >
      <div className="flex items-center gap-2 px-2">
        <Logo className="h-6 w-auto text-white" />
        <span className="rounded-sm border border-sidebar-line px-1.5 py-0.5 font-mono text-label text-sidebar-text uppercase">
          Internal
        </span>
      </div>

      {/* Single client for now; the switcher menu comes later (PRD › Later). */}
      <div className="mt-6 flex items-center justify-between rounded-control bg-sidebar-2 px-3 py-2.5">
        <div>
          <p className="mono-label text-sidebar-text">Client</p>
          <p className="text-body-sm">{sampleClient.name}</p>
        </div>
        <ChevronDown size={16} className="text-sidebar-text" aria-hidden="true" />
      </div>

      <nav aria-label="Main" className="mt-6 flex flex-col gap-6">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="mb-2 px-2 mono-label text-sidebar-text">{section.label}</p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `relative flex h-10 items-center gap-3 rounded-control px-3 text-body-sm transition-colors ${
                        isActive
                          ? "bg-sidebar-2 text-white before:absolute before:inset-y-2 before:left-0 before:w-0.75 before:rounded-full before:bg-flash"
                          : "text-sidebar-text hover:bg-sidebar-2/60 hover:text-white"
                      }`
                    }
                  >
                    <Icon size={18} aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-4">
        <button
          type="button"
          onClick={onAskBlip}
          aria-keyshortcuts="/"
          className="flex h-14 items-center gap-3 rounded-card border border-sidebar-line px-4 text-body-sm hover:bg-sidebar-2"
        >
          <BlipIdle className="h-auto w-7" />
          <span className="flex-1 text-left">Ask Blip</span>
          <kbd className="font-mono text-label text-sidebar-text">/</kbd>
        </button>

        <div className="px-1">
          <CreditsMeter {...sampleCredits} />
        </div>

        <div className="flex items-center gap-3 border-t border-sidebar-line px-1 pt-4">
          <Avatar initials={me.initials} tone="user" size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm">{me.name}</p>
            <p className="text-label text-sidebar-text">{me.role}</p>
          </div>
          <Link
            to="/settings"
            aria-label="Settings"
            className="inline-flex size-8 items-center justify-center rounded-control text-sidebar-text hover:bg-sidebar-2 hover:text-white"
          >
            <SlidersVertical size={18} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
