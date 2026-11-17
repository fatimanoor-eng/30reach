/**
 * SAMPLE DATA ONLY — replaced by Supabase queries from Slice 2 on.
 * Numbers mirror the Figma mocks (which are fake too).
 */

export type Brand = {
  id: string;
  name: string;
  initials: string;
};

export const sampleClient = { id: "obu-health", name: "OBU Health", initials: "OB" };

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
