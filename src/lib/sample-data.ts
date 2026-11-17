/**
 * SAMPLE DATA — only for the dev component gallery (/dev/components) and unit tests.
 * The app reads clients, competitors and credits from Supabase; never import this in app screens.
 */

import type { Brand } from "./brand-selection";

/** Pill order as in Figma 04 / 06a. */
export const sampleBrands: Brand[] = [
  { id: "hers", name: "Hers", initials: "He" },
  { id: "hims", name: "Hims", initials: "Hi" },
  { id: "ro", name: "Ro", initials: "Ro" },
  { id: "weightwatchers", name: "WeightWatchers", initials: "WW" },
  { id: "found", name: "Found", initials: "Fo" },
  { id: "lifemd", name: "LifeMD", initials: "LM" },
];

/** Shape of the `credits` Edge Function response — dev gallery only. */
export const sampleCredits = {
  remaining: 588,
  plan: 1000,
  periodStart: "2026-11-01T00:00:00Z",
  resetsAt: "2026-12-01T12:00:00Z",
  updatedAt: "2026-11-17T14:02:00Z",
  stale: false,
};
