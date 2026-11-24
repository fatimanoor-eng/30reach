import { Link } from "react-router";
import { Logo } from "../components/Logo";
import { useClientPath } from "../lib/useClient";
import { MobileClientSwitcher } from "./ClientSwitcher";

/** Mobile black app bar: logo + client switcher (Figma M02, sheet M13). Below 768 px. */
export function MobileAppBar({ className = "" }: { className?: string }) {
  const path = useClientPath();
  return (
    <header
      className={`on-dark sticky top-0 z-30 bg-sidebar pt-[env(safe-area-inset-top)] text-white ${className}`}
    >
      <div className="flex h-16 items-center justify-between px-4">
        <Link
          to={path("/overview")}
          aria-label="30reach, overview"
          className="flex h-11 items-center rounded-sm"
        >
          <Logo className="h-5 w-auto text-white" />
        </Link>
        <MobileClientSwitcher />
      </div>
    </header>
  );
}
