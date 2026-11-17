import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toggleBrand } from "./brand-selection";
import { BrandSelectionContext } from "./brand-selection-context";

export function BrandSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const toggle = useCallback((id: string) => setSelected((s) => toggleBrand(s, id)), []);
  const clear = useCallback(() => setSelected([]), []);
  const value = useMemo(() => ({ selected, toggle, clear }), [selected, toggle, clear]);
  return <BrandSelectionContext value={value}>{children}</BrandSelectionContext>;
}
