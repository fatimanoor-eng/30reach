import { ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { Logo } from "../components/Logo";
import { sampleClient } from "../lib/sample-data";

/** Mobile black app bar: logo + client switcher (Figma M02). Below 768 px. */
export function MobileAppBar({ className = "" }: { className?: string }) {
  return (
    <header
      className={`on-dark sticky top-0 z-30 bg-sidebar pt-[env(safe-area-inset-top)] text-white ${className}`}
    >
      <div className="flex h-16 items-center justify-between px-4">
        <Link
          to="/overview"
          aria-label="30reach, overview"
          className="flex h-11 items-center rounded-sm"
        >
          <Logo className="h-5 w-auto text-white" />
        </Link>
        {/* Single client for now — the menu comes later. */}
        <div className="flex h-9 items-center gap-1.5 rounded-full bg-sidebar-2 pr-2.5 pl-3.5 text-body-sm">
          {sampleClient.name}
          <ChevronDown size={16} className="text-sidebar-text" aria-hidden="true" />
        </div>
      </div>
    </header>
  );
}
