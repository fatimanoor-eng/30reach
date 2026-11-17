import { createClient } from "@supabase/supabase-js";

/**
 * The only Supabase client in the browser. Uses the PUBLISHABLE key — safe in the browser because
 * RLS protects every table (CLAUDE.md rule 1). No other key may ever be used here.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** False when the build has no Supabase settings (e.g. Cloudflare build variables not set). */
export const supabaseConfigured = Boolean(url && publishableKey);

/** Fixed storage key so tests can plant a session without knowing the project ref. */
export const AUTH_STORAGE_KEY = "30reach-auth";

export const supabase = createClient(
  url || "https://not-configured.invalid",
  publishableKey || "not-configured",
  {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
    },
  },
);
