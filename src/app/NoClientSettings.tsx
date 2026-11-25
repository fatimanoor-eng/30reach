import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { Logo } from "../components/Logo";
import { ToastProvider } from "../components/ToastProvider";
import { SettingsPage } from "../features/settings/SettingsPage";

/**
 * Settings when no client is active (UI fixes, 25 Nov): Team, the demo client and Account (Sign out),
 * outside the app shell, which needs a client. The per-client cards (Data, Usage) are left out.
 * "← Clients" goes back to the "No active clients" page.
 */
export function NoClientSettings() {
  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col bg-bg">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-line bg-bg px-4 md:h-16 md:bg-surface md:px-6 xl:px-8">
          <Logo className="h-6 w-auto" />
          <Link
            to="/"
            className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-body-sm font-medium text-muted hover:bg-soft hover:text-ink md:min-h-10"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Clients
          </Link>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-300 px-4 py-6 md:px-6 md:py-8 xl:px-10 xl:py-10"
        >
          <SettingsPage />
        </main>
      </div>
    </ToastProvider>
  );
}
