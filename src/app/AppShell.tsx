import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { BlipIdle } from "../components/blip/BlipPoses";
import { ToastProvider } from "../components/ToastProvider";
import { AskBlipPlaceholder } from "../features/blip/AskBlipPlaceholder";
import { PullProvider } from "../features/pulls/PullProvider";
import { AskBlipContext } from "./ask-blip-context";
import { BrandSelectionProvider } from "../lib/BrandSelectionProvider";
import { BottomTabs } from "./BottomTabs";
import { IconRail } from "./IconRail";
import { MobileAppBar } from "./MobileAppBar";
import { Sidebar } from "./Sidebar";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/**
 * App shell. Navigation by width (DESIGN_SYSTEM › Layout and breakpoints):
 * < 768 app bar + bottom tabs + Blip button · 768–1199 icon rail · ≥ 1200 full sidebar.
 */
export function AppShell() {
  const [askOpen, setAskOpen] = useState(false);

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

  const openAsk = () => setAskOpen(true);

  return (
    <BrandSelectionProvider>
      <ToastProvider>
        <PullProvider>
          <AskBlipContext value={openAsk}>
            <a
              href="#main"
              className="sr-only z-50 rounded-control bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
            >
              Skip to content
            </a>

            <div className="min-h-dvh md:flex">
              <Sidebar onAskBlip={openAsk} className="hidden xl:flex" />
              <IconRail onAskBlip={openAsk} className="hidden md:flex xl:hidden" />
              <MobileAppBar className="md:hidden" />

              <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-28 md:pb-0">
                <div className="mx-auto max-w-300 px-4 py-6 md:px-6 md:py-8 xl:px-10 xl:py-10">
                  <Outlet />
                </div>
              </main>
            </div>

            <BottomTabs className="md:hidden" />

            {/* Mobile Ask Blip: floating Blip button; hidden while a sheet/dialog is open. */}
            <button
              type="button"
              onClick={openAsk}
              aria-label="Ask Blip"
              className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 inline-flex size-14 items-center justify-center rounded-full bg-ink shadow-lg md:hidden [body:has(dialog[open])_&]:hidden"
            >
              <BlipIdle className="h-auto w-9" />
            </button>

            <AskBlipPlaceholder open={askOpen} onClose={() => setAskOpen(false)} />
          </AskBlipContext>
        </PullProvider>
      </ToastProvider>
    </BrandSelectionProvider>
  );
}
