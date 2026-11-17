/** Average glyph width of BDO Grotesk Medium in em, plus a little slack, for shrink-to-fit. */
const EM_PER_CHAR = 0.62;

/**
 * Mono label, big value, small caption (Figma 04). Mobile (M02): shorter label, no caption.
 *
 * The value always stays on one line: its font size shrinks to fit the tile (container query:
 * 100cqi = tile width), between a floor (15 px mobile / 18 px up) and the KPI size (26 px mobile /
 * 36 px up). The value line has a fixed height (KPI size × 1.1), so every tile is the same height
 * however much its value shrank. Only if even the floor is too wide does it truncate — the full value
 * is in the tooltip (title).
 */
export function KpiTile({
  label,
  shortLabel,
  value,
  caption,
  mobileSuffix,
}: {
  label: string;
  /** Mobile label, e.g. "Posts" for "Posts tracked". */
  shortLabel?: string;
  value: string;
  caption?: string;
  /** Small text after the value on mobile only (captions are hidden there), e.g. "am". */
  mobileSuffix?: string;
}) {
  const chars = Math.max(value.length, 4);
  return (
    <div className="@container flex flex-col gap-2 rounded-tile border border-line bg-surface p-4 md:p-5">
      <p className="mono-label text-muted">
        {shortLabel ? (
          <>
            <span className="md:hidden">{shortLabel}</span>
            <span className="hidden md:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </p>
      <p className="flex h-[calc(var(--kpi-max)*1.1)] min-w-0 items-center gap-1 [--kpi-max:var(--text-kpi-sm)] [--kpi-min:var(--text-body)] md:[--kpi-max:var(--text-kpi)] md:[--kpi-min:var(--text-card)]">
        <span
          title={value}
          className="min-w-0 truncate leading-[1.1] font-medium"
          style={{
            fontSize: `clamp(var(--kpi-min), calc(100cqi / ${(chars + (mobileSuffix ? 2 : 0)) * EM_PER_CHAR}), var(--kpi-max))`,
          }}
        >
          {value}
        </span>
        {mobileSuffix && (
          <span className="shrink-0 text-small text-muted md:hidden">{mobileSuffix}</span>
        )}
      </p>
      {caption && <p className="hidden text-small text-muted md:block">{caption}</p>}
    </div>
  );
}
