/**
 * Mono label, big value, small caption (Figma 04). Mobile (M02): shorter label, no caption.
 */
export function KpiTile({
  label,
  shortLabel,
  value,
  caption,
}: {
  label: string;
  /** Mobile label, e.g. "Posts" for "Posts tracked". */
  shortLabel?: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-tile border border-line bg-surface p-4 md:p-5">
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
      <p className="text-kpi-sm md:text-kpi">{value}</p>
      {caption && <p className="hidden text-small text-muted md:block">{caption}</p>}
    </div>
  );
}
