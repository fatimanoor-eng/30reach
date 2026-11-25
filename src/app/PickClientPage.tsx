import { useLocation } from "react-router";
import { BlipWave } from "../components/blip/BlipPoses";
import { Logo } from "../components/Logo";
import { clientPath } from "../lib/client-path";
import { ClientMenu } from "./ClientSwitcher";

/**
 * "Pick a client" (Slice 17h; no Figma frame yet, built from the switcher and the Add client shell).
 * Shown by LastClientRedirect only when there's no last client to open: a first visit, or your last client
 * was archived or deleted. Everyone else goes straight to their last client, as before.
 *
 * The list is the switcher's own (logo / initials, name, last pull or DEMO, search from 6 clients,
 * "+ Add client"); archived clients aren't offered. Picking opens that client: a plain visit opens its
 * Overview, an old link (e.g. /ideas?idea=…) keeps its page. The client is remembered (profile + this
 * browser) when its page opens (useRememberClient), so nothing is saved here.
 * Tablet / desktop: a centred card. Phones: the same list full screen.
 */
export function PickClientPage({ archivedName }: { archivedName?: string | null }) {
  const { pathname, search, hash, state } = useLocation();
  const page = pathname === "/" ? "/overview" : pathname;
  const hrefFor = (slug: string) => `${clientPath(slug, page)}${search}${hash}`;
  // An archived client's own link sends a notice along (AppShell); our own line says the same thing.
  const notice = (state as { notice?: string } | null)?.notice;
  const line = archivedName
    ? `${archivedName} is archived. Choose another client to carry on.`
    : (notice ?? "Choose who you’re working on. You can switch any time from the client menu.");

  return (
    <div className="flex min-h-dvh flex-col bg-bg md:bg-bg">
      <header className="flex h-14 items-center border-b border-line bg-bg px-4 md:h-16 md:bg-surface md:px-6 xl:px-8">
        <Logo className="h-6 w-auto" />
      </header>
      <main className="flex flex-1 justify-center md:items-start md:px-6 md:py-12">
        <section
          aria-labelledby="pick-client-title"
          className="flex w-full flex-col px-4 pt-6 pb-8 md:max-w-[480px] md:rounded-card md:border md:border-line md:bg-surface md:p-6"
        >
          <BlipWave className="mx-auto h-auto w-20 md:w-24" />
          <h1 id="pick-client-title" className="mt-3 text-center text-heading md:text-heading-md">
            Pick a client
          </h1>
          <p className="mt-2 text-center text-body-sm text-muted">{line}</p>
          <div className="mt-6">
            <ClientMenu variant="page" onPick={() => {}} hrefFor={hrefFor} />
          </div>
        </section>
      </main>
    </div>
  );
}
