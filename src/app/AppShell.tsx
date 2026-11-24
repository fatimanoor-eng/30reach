import { useEffect, useState } from "react";
import { BlipIdle } from "../components/blip/BlipPoses";
import { ToastProvider } from "../components/ToastProvider";
import { AskBlipPanel } from "../features/blip/AskBlipPanel";
import { useBlipThread } from "../features/blip/useBlipThread";
import { ModalPresence } from "../components/ModalPresence";
import { useClient, useClientSlug, useRememberClient } from "../lib/useClient";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Link, Outlet } from "react-router";
import { IdeaCaptureProvider } from "../features/ideas/IdeaCaptureProvider";
import { SaveAsIdeaProvider } from "../features/posts/SaveAsIdeaProvider";
import { PullProvider } from "../features/pulls/PullProvider";
import { AskBlipContext } from "./ask-blip-context";
import { BrandSelectionProvider } from "../lib/BrandSelectionProvider";
import { isTyping } from "../lib/is-typing";
import { BottomTabs } from "./BottomTabs";
import { IconRail } from "./IconRail";
import { MobileAppBar } from "./MobileAppBar";
import { Sidebar } from "./Sidebar";

/**
 * App shell. Navigation by width (DESIGN_SYSTEM › Layout and breakpoints):
 * < 768 app bar + bottom tabs + Blip button · 768–1199 icon rail · ≥ 1200 full sidebar.
 */
export function AppShell() {
  const [askOpen, setAskOpen] = useState(false);
  // Ask Blip's thread lives here for the session, so the panel can unmount between opens.
  const client = useClient();
  const thread = useBlipThread(client.data?.id);
  // Slice 17b: remember the client you opened (this browser + your profile, for any device).
  useRememberClient(client.data);
  // The slug in the URL (not the loaded client): known at once, so pages don't mount twice.
  const slug = useClientSlug();

  // "/" opens Ask Blip (ANNOTATIONS › Shared rules), unless you're typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setAskOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // With a question ("Ask Blip what changed" on 05e), Blip asks it straight away.
  const openAsk = (question?: string) => {
    if (question) void thread.ask(question);
    setAskOpen(true);
  };
  const openAskPlain = () => openAsk();

  return (
    <BrandSelectionProvider resetKey={slug}>
      <ToastProvider>
        <PullProvider>
          <IdeaCaptureProvider>
            <SaveAsIdeaProvider>
              <AskBlipContext value={openAsk}>
                <a
                  href="#main"
                  className="sr-only z-50 rounded-control bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
                >
                  Skip to content
                </a>

                <div className="min-h-dvh md:flex">
                  <Sidebar onAskBlip={openAskPlain} className="hidden xl:flex" />
                  <IconRail onAskBlip={openAskPlain} className="hidden md:flex xl:hidden" />
                  <MobileAppBar className="md:hidden" />

                  <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-28 md:pb-0">
                    <div className="mx-auto max-w-300 px-4 py-6 md:px-6 md:py-8 xl:px-10 xl:py-10">
                      {client.data === null ? (
                        <ClientNotFound />
                      ) : (
                        // Keyed by client: switching clients starts each page fresh (filters, open
                        // panels), while the shell (and a running pull) stays.
                        <div key={slug} className="contents">
                          <Outlet />
                        </div>
                      )}
                    </div>
                  </main>
                </div>

                <BottomTabs className="md:hidden" />

                {/* Mobile Ask Blip: floating Blip button; hidden while a sheet/dialog is open or the idea board is in Select mode. */}
                <button
                  type="button"
                  onClick={openAskPlain}
                  aria-label="Ask Blip"
                  className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 inline-flex size-14 items-center justify-center rounded-full bg-ink shadow-lg md:hidden [body:has([data-select-bar])_&]:hidden [body:has(dialog[open])_&]:hidden"
                >
                  <BlipIdle className="h-auto w-9" />
                </button>

                <ModalPresence open={askOpen}>
                  <AskBlipPanel open onClose={() => setAskOpen(false)} thread={thread} />
                </ModalPresence>
              </AskBlipContext>
            </SaveAsIdeaProvider>
          </IdeaCaptureProvider>
        </PullProvider>
      </ToastProvider>
    </BrandSelectionProvider>
  );
}

/** /c/{slug} for a slug no client has (renamed, deleted, mistyped). */
function ClientNotFound() {
  return (
    <Card>
      <EmptyState
        label="404"
        title="Client not found"
        text="This client doesn’t exist or was deleted."
        actions={
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-control bg-ink px-4 text-body-sm font-medium text-white md:min-h-10"
          >
            Go to your last client
          </Link>
        }
      />
    </Card>
  );
}
