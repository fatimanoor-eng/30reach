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

export const sampleCredits = { remaining: 588, plan: 1000, resetsOn: "1 Dec" };
