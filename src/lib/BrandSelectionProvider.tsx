import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toggleBrand } from "./brand-selection";
import { BrandSelectionContext } from "./brand-selection-context";

/** `resetKey` = the client (Slice 17b): another client's brands start unselected. */
export function BrandSelectionProvider({
  children,
  resetKey,
}: {
  children: ReactNode;
  resetKey?: string;
}) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [selectedFor, setSelectedFor] = useState(resetKey);
  if (selectedFor !== resetKey) {
    setSelectedFor(resetKey);
    setSelected([]);
  }
  const toggle = useCallback((id: string) => setSelected((s) => toggleBrand(s, id)), []);
  const clear = useCallback(() => setSelected([]), []);
  const value = useMemo(() => ({ selected, toggle, clear }), [selected, toggle, clear]);
  return <BrandSelectionContext value={value}>{children}</BrandSelectionContext>;
}
