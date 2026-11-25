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
  const northwind = {
    id: "client-1",
    slug: "northwind-clinic",
    name: "Northwind Clinic",
    initials: null,
    brand_color: null,
    is_demo: false,
    archived_at: null,
  };
  // Per-table answers. Every query method chains; .single()/.maybeSingle() return the row,
  // awaiting the query itself returns the list.
  const tables: Record<string, { row: unknown; list: unknown[] }> = {
    // A returning user (Slice 17h): without a last client, "/" shows Pick a client instead.
    profiles: {
      row: { role: "admin", full_name: "Fatima Noor", last_client_id: "client-1" },
      list: [],
    },
    // Deliberately not "OBU Health": proves the shell shows the database name, not sample data.
    // Slice 17b: the client is in the URL (/c/northwind-clinic/…); "/" and old paths redirect there.
    clients: { row: northwind, list: [northwind] },
    pulls: { row: null, list: [] }, // no running pull
    pull_tasks: { row: null, list: [] },
    competitors: {
      row: null,
      list: [
        { id: "c-hers", name: "Hers", initials: "He", instagram_handle: "hers" },
        { id: "c-hims", name: "Hims", initials: "Hi", instagram_handle: "hims" },
        { id: "c-ro", name: "Ro", initials: "Ro", instagram_handle: "ro" },
      ],
    },
    posts: { row: null, list: [] },
  };
  const from = (table: string) => {
    const t = tables[table] ?? { row: null, list: [] };
    // .eq() on a column the row has must match it (e.g. clients by slug: an unknown slug → null).
    const filters: [string, unknown][] = [];
    const row = () => {
      const r = t.row as Record<string, unknown> | null;
      return r && filters.every(([k, v]) => !(k in r) || r[k] === v) ? r : null;
    };
    const query: Record<string, unknown> = {
      single: async () => ({ data: row(), error: null }),
      maybeSingle: async () => ({ data: row(), error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: t.list, error: null }),
    };
    for (const m of ["select", "neq", "in", "order", "limit", "or"]) query[m] = () => query;
    query.eq = (k: string, v: unknown) => {
      filters.push([k, v]);
      return query;
    };
    return query;
  };
  return {
    supabaseConfigured: true,
    AUTH_STORAGE_KEY: "30reach-auth",
    supabase: {
      from,
      rpc: async () => ({ data: null, error: null }), // set_last_client
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
