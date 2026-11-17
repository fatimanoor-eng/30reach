/**
 * Brand pill selection rules (ANNOTATIONS.md › Shared rules › Brand pills).
 * - Empty selection = "All brands".
 * - One brand = that brand only. Two or three = compare mode.
 * - Clicking a lit pill removes it. "All brands" / Clear resets.
 * - Max 3: a 4th pick is blocked (UI shows the other pills as disabled).
 */

/** A competitor as the brand pills need it (from the `competitors` table). */
export type Brand = { id: string; name: string; initials: string };

export const MAX_COMPARE = 3;

export type SelectionMode = "all" | "single" | "compare";

/** Compare colours in selection order: 1st ink, 2nd B30 Pop, 3rd B30 Blue. */
export const COMPARE_COLORS = ["ink", "pop", "blue"] as const;
export type CompareColor = (typeof COMPARE_COLORS)[number];

export function selectionMode(selected: readonly string[]): SelectionMode {
  if (selected.length === 0) return "all";
  return selected.length === 1 ? "single" : "compare";
}

/** Returns the new selection. Unchanged (same array) when the pick is blocked. */
export function toggleBrand(selected: readonly string[], id: string): readonly string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  if (selected.length >= MAX_COMPARE) return selected;
  return [...selected, id];
}

export function isBlocked(selected: readonly string[], id: string): boolean {
  return !selected.includes(id) && selected.length >= MAX_COMPARE;
}

export function compareColor(selected: readonly string[], id: string): CompareColor | null {
  const index = selected.indexOf(id);
  return index === -1 ? null : COMPARE_COLORS[index];
}
