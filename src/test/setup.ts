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

// jsdom has no ResizeObserver (Ask Blip follows its thread with one). A no-op is enough here:
// layout never changes in jsdom.
if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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
  // Per-table answers. Every query method chains; .single()/.maybeSingle() return the row,
  // awaiting the query itself returns the list.
  const tables: Record<string, { row: unknown; list: unknown[] }> = {
    profiles: { row: { role: "admin", full_name: "Fatima Noor" }, list: [] },
    // Deliberately not "OBU Health": proves the shell shows the database name, not sample data.
    clients: { row: { id: "client-1", name: "Northwind Clinic" }, list: [] },
    pulls: { row: null, list: [] }, // no running pull
    pull_tasks: { row: null, list: [] },
    competitors: {
      row: null,
      list: [
        { id: "c-hers", name: "Hers", initials: "He" },
        { id: "c-hims", name: "Hims", initials: "Hi" },
        { id: "c-ro", name: "Ro", initials: "Ro" },
      ],
    },
    posts: { row: null, list: [] },
  };
  const from = (table: string) => {
    const t = tables[table] ?? { row: null, list: [] };
    const query: Record<string, unknown> = {
      single: async () => ({ data: t.row, error: null }),
      maybeSingle: async () => ({ data: t.row, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: t.list, error: null }),
    };
    for (const m of ["select", "eq", "neq", "in", "order", "limit", "or"]) query[m] = () => query;
    return query;
  };
  return {
    supabaseConfigured: true,
    AUTH_STORAGE_KEY: "30reach-auth",
    supabase: {
      from,
      functions: {
        invoke: async () => ({
          data: {
            remaining: 588,
            plan: 1000,
            periodStart: "2026-11-01T00:00:00Z",
            resetsAt: "2026-12-01T12:00:00Z",
            updatedAt: "2026-11-17T14:02:00Z",
            stale: false,
          },
          error: null,
        }),
      },
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithOAuth: async () => ({ error: null }),
        signOut: async () => ({ error: null }),
      },
    },
  };
});
