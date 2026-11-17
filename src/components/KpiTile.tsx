/** Mono label, big value, small caption (Figma 04 / M02). */
export function KpiTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-tile border border-line bg-surface p-4 md:p-5">
      <p className="mono-label text-muted">{label}</p>
      <p className="text-kpi-sm md:text-kpi">{value}</p>
      {caption && <p className="text-small text-muted">{caption}</p>}
    </div>
  );
}
