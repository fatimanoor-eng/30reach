import { Link, NavLink } from "react-router";
import { Avatar } from "../components/Avatar";
import { BlipIdle } from "../components/blip/BlipPoses";
import { LogoMark } from "../components/Logo";
import { Tooltip } from "../components/Tooltip";
import { useCurrentUser } from "../lib/auth/useCurrentUser";
import { clientInitials, useClient } from "../lib/useClient";
import { creditsFraction } from "../lib/format";
import { creditsSummary, useCredits } from "../lib/useCredits";
import { navSections } from "./nav";

const railButton =
  "relative inline-flex size-11 items-center justify-center rounded-control transition-colors";

/**
 * Tablet icon rail, 64 px (768–1199 px). Not drawn in Figma — agreed layout:
 * mark · client · nav icons (tooltips, yellow active bar) · Ask Blip · credits bar · avatar.
 */
export function IconRail({
  onAskBlip,
  className = "",
}: {
  onAskBlip: () => void;
  className?: string;
}) {
  const clientName = useClient().data?.name;
  const me = useCurrentUser();
  const credits = useCredits();

  return (
    <aside
      aria-label="Navigation rail"
      className={`on-dark sticky top-0 h-dvh w-16 shrink-0 flex-col items-center bg-sidebar py-5 text-white ${className}`}
    >
      <LogoMark className="h-auto w-8 text-white" />

      {clientName ? (
        <Tooltip side="right" content={`Client: ${clientName}`} className="mt-5">
          {(t) => (
            <span
              tabIndex={0}
              aria-describedby={t["aria-describedby"]}
              aria-label={`Client: ${clientName}`}
              className="rounded-full"
            >
              <Avatar initials={clientInitials(clientName)} tone="dark" size="md" />
            </span>
          )}
        </Tooltip>
      ) : (
        // Loading (or failed): same-size placeholder so the rail doesn't jump.
        <span
          aria-hidden="true"
          className="mt-5 size-8 rounded-full bg-sidebar-2 motion-safe:animate-pulse"
        />
      )}

      <nav aria-label="Main" className="mt-5 flex flex-col items-center gap-1">
        {navSections.map((section, i) => (
          <ul key={section.label} className="flex flex-col items-center gap-1">
            {i > 0 && <li aria-hidden="true" className="my-2 h-px w-8 bg-sidebar-line" />}
            {section.items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Tooltip side="right" content={label}>
                  {(t) => (
                    <NavLink
                      to={to}
                      aria-label={label}
                      aria-describedby={t["aria-describedby"]}
                      className={({ isActive }) =>
                        `${railButton} ${
                          isActive
                            ? "bg-sidebar-2 text-white before:absolute before:inset-y-2.5 before:-left-2.5 before:w-0.75 before:rounded-full before:bg-flash"
                            : "text-sidebar-text hover:bg-sidebar-2/60 hover:text-white"
                        }`
                      }
                    >
                      <Icon size={20} aria-hidden="true" />
                    </NavLink>
                  )}
                </Tooltip>
              </li>
            ))}
          </ul>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-4">
        <Tooltip side="right" content="Ask Blip  /">
          {(t) => (
            <button
              type="button"
              onClick={onAskBlip}
              aria-label="Ask Blip"
              aria-keyshortcuts="/"
              aria-describedby={t["aria-describedby"]}
              className={`${railButton} border border-sidebar-line hover:bg-sidebar-2`}
            >
              <BlipIdle className="h-auto w-7" />
            </button>
          )}
        </Tooltip>

        <Tooltip
          side="right"
          content={
            credits.status === "error"
              ? `${creditsSummary(credits)} · click to retry`
              : creditsSummary(credits)
          }
        >
          {(t) => {
            const ready = credits.status === "ready" ? credits.credits : null;
            const pct = ready ? creditsFraction(ready.remaining, ready.plan) * 100 : 0;
            const meter = (
              <>
                <div className="relative h-14 w-1 overflow-hidden rounded-full bg-sidebar-line">
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-full bg-flash transition-[height] duration-300"
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className="font-mono text-label">{ready ? ready.remaining : "—"}</span>
              </>
            );
            return credits.status === "error" ? (
              <button
                type="button"
                onClick={credits.retry}
                aria-label="Couldn't load Firecrawl credits. Retry"
                aria-describedby={t["aria-describedby"]}
                className="flex flex-col items-center gap-1.5 rounded-control px-2 py-1 hover:bg-sidebar-2"
              >
                {meter}
              </button>
            ) : (
              <div
                tabIndex={0}
                role="meter"
                aria-label="Firecrawl credits left"
                aria-valuemin={0}
                aria-valuemax={ready ? Math.max(ready.plan, ready.remaining) : 0}
                aria-valuenow={ready?.remaining ?? 0}
                aria-valuetext={creditsSummary(credits)}
                aria-busy={credits.status === "loading" || undefined}
                aria-describedby={t["aria-describedby"]}
                className="flex flex-col items-center gap-1.5 rounded-control px-2 py-1"
              >
                {meter}
              </div>
            );
          }}
        </Tooltip>

        <Tooltip side="right" content={`${me.name} · Settings`}>
          {(t) => (
            <Link
              to="/settings"
              aria-label={`${me.name}, settings`}
              aria-describedby={t["aria-describedby"]}
              className="rounded-full"
            >
              <Avatar initials={me.initials} tone="user" size="md" />
            </Link>
          )}
        </Tooltip>
      </div>
    </aside>
  );
}
