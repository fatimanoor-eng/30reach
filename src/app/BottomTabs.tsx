import { Link, useLocation } from "react-router";
import { appPathOf } from "../lib/client-path";
import { useClientPath } from "../lib/useClient";
import { isActive } from "./nav";
import { useMobileTabs } from "./useNav";

/** Mobile bottom tabs: Overview · Social · Calendar · Ideas · More (Figma M02). Below 768 px. */
export function BottomTabs({ className = "" }: { className?: string }) {
  const { pathname } = useLocation();
  const mobileTabs = useMobileTabs();
  const path = useClientPath();

  return (
    <nav
      aria-label="Main"
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] ${className}`}
    >
      <ul className="grid h-16 grid-cols-5">
        {mobileTabs.map(({ to, label, icon: Icon, match }) => {
          const active = isActive(appPathOf(pathname), match);
          return (
            <li key={to}>
              <Link
                to={path(to)}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-1 text-label ${
                  active
                    ? "text-ink before:absolute before:top-1.5 before:h-0.75 before:w-6 before:rounded-full before:bg-flash"
                    : "text-muted"
                }`}
              >
                <Icon size={22} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
