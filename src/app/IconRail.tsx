import { Link, NavLink } from "react-router";
import { Avatar } from "../components/Avatar";
import { BlipIdle } from "../components/blip/BlipPoses";
import { LogoMark } from "../components/Logo";
import { Tooltip } from "../components/Tooltip";
import { useCurrentUser } from "../lib/auth/useCurrentUser";
import { sampleClient, sampleCredits } from "../lib/sample-data";
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
  const me = useCurrentUser();
  const pct = (sampleCredits.remaining / sampleCredits.plan) * 100;

  return (
    <aside
      aria-label="Navigation rail"
      className={`on-dark sticky top-0 h-dvh w-16 shrink-0 flex-col items-center bg-sidebar py-5 text-white ${className}`}
    >
      <LogoMark className="h-auto w-8 text-white" />

      <Tooltip side="right" content={`Client: ${sampleClient.name}`} className="mt-5">
        {(t) => (
          <span
            tabIndex={0}
            aria-describedby={t["aria-describedby"]}
            aria-label={`Client: ${sampleClient.name}`}
            className="rounded-full"
          >
            <Avatar initials={sampleClient.initials} tone="dark" size="md" />
          </span>
        )}
      </Tooltip>

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
          content={`${sampleCredits.remaining} of ${sampleCredits.plan.toLocaleString("en-US")} credits left · resets ${sampleCredits.resetsOn}`}
        >
          {(t) => (
            <div
              tabIndex={0}
              role="meter"
              aria-label="Firecrawl credits left"
              aria-valuemin={0}
              aria-valuemax={sampleCredits.plan}
              aria-valuenow={sampleCredits.remaining}
              aria-describedby={t["aria-describedby"]}
              className="flex flex-col items-center gap-1.5 rounded-control px-2 py-1"
            >
              <div className="relative h-14 w-1 overflow-hidden rounded-full bg-sidebar-line">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-full bg-flash"
                  style={{ height: `${pct}%` }}
                />
              </div>
              <span className="font-mono text-label">{sampleCredits.remaining}</span>
            </div>
          )}
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
