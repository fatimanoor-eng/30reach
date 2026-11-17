import { createContext, useContext } from "react";

export type BrandSelectionValue = {
  selected: readonly string[];
  toggle: (id: string) => void;
  clear: () => void;
};

export const BrandSelectionContext = createContext<BrandSelectionValue | null>(null);

/** Shared brand pill selection (Overview, Instagram, TikTok). */
export function useBrandSelection(): BrandSelectionValue {
  const value = useContext(BrandSelectionContext);
  if (!value) throw new Error("useBrandSelection must be used inside <BrandSelectionProvider>");
  return value;
}
