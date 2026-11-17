import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// jsdom has no matchMedia. Default: phone width (no media query matches).
// Tests can set `window.__mqMatches = true` to pretend to be tablet/desktop.
declare global {
  interface Window {
    __mqMatches?: boolean;
  }
}
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: !!window.__mqMatches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom's <dialog> may lack showModal/close. Minimal stand-ins: toggle the `open` attribute.
const proto = HTMLDialogElement.prototype;
if (!proto.showModal) {
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}
if (!proto.close) {
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

// Never talk to the real Supabase project from unit tests: replace the client module.
// Profile reads resolve to a fixed admin row; auth calls are no-ops.
vi.mock("../lib/supabase", () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: { role: "admin", full_name: "Fatima Noor" }, error: null }),
  };
  return {
    supabaseConfigured: true,
    AUTH_STORAGE_KEY: "30reach-auth",
    supabase: {
      from: () => query,
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithOAuth: async () => ({ error: null }),
        signOut: async () => ({ error: null }),
      },
    },
  };
});
