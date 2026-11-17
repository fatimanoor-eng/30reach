import { selectionMode } from "../lib/brand-selection";
import { useBrandSelection } from "../lib/brand-selection-context";
import { sampleBrands } from "../lib/sample-data";

/** Placeholder line proving the pill selection is shared across pages. Removed when real pages land. */
export function SelectionSummary() {
  const { selected } = useBrandSelection();
  const names = selected.map((id) => sampleBrands.find((b) => b.id === id)?.name ?? id);
  const mode = selectionMode(selected);
  const text =
    mode === "all" ? "All brands" : mode === "single" ? names[0] : `Compare ${names.join(" vs ")}`;
  return (
    <p className="mt-3 mono-label text-muted" aria-live="polite">
      Selection: {text}
    </p>
  );
}
