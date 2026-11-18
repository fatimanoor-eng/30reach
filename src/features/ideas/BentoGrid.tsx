import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { rowSpan } from "./idea-rules";

/**
 * Bento grid (DESIGN_SYSTEM › Idea board): 2 / 3 / 4 columns, rows of --bento-unit (8 px) with no
 * row gap, `dense` so smaller tiles fill the holes. The page order (newest first) stays the reading
 * order for keyboards and screen readers.
 */
export function BentoGrid({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  /** Loading state: names the busy region. */
  label?: string;
  className?: string;
}) {
  return (
    <div
      aria-busy={label ? true : undefined}
      aria-label={label}
      className={`grid grid-flow-row-dense auto-rows-(--bento-unit) grid-cols-2 items-start gap-x-2.5 md:grid-cols-3 md:gap-x-4 xl:grid-cols-4 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * One tile: 1 or 2 columns wide; its row span comes from its real height (the picture at its own
 * ratio plus the text) and the column gap, so the space below every tile matches the gap between
 * columns. Measured before paint, then again whenever the tile's size changes (window resize,
 * an image of unknown size loading, tags edited).
 */
export function BentoItem({
  columns,
  rows: fixedRows,
  children,
  className = "",
}: {
  columns: 1 | 2;
  /** A fixed span (skeletons); otherwise measured. */
  rows?: number;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(fixedRows ?? 1);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el || fixedRows) return;
    const grid = el.parentElement;
    const style = grid ? getComputedStyle(grid) : null;
    const unit = parseFloat(style?.gridAutoRows ?? "") || 8;
    const gap = parseFloat(style?.columnGap ?? "") || 0;
    const next = rowSpan(el.offsetHeight, unit, gap);
    setRows((prev) => (prev === next ? prev : next));
  }, [fixedRows]);

  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined" || !ref.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div
      ref={ref}
      data-columns={columns}
      style={{ gridRowEnd: `span ${fixedRows ?? rows}` }}
      className={`${columns === 2 ? "col-span-2" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
