import type { CSSProperties, ReactNode } from "react";

/**
 * Loading skeletons in each page's real layout (DESIGN_SYSTEM › States).
 * • Bone — a grey block; soft pulse unless the person prefers reduced motion.
 * • Skeleton — the busy region (aria-busy + label, like the rest of the app; not role="status",
 *   which the toast uses): hidden for its first 150 ms (index.css › Loading skeletons), then shown.
 * • SkeletonCard / SkeletonKpis — white card and KPI tile shapes with bones inside.
 */
export function Bone({
  className = "",
  style,
}: {
  className?: string;
  /** e.g. a measured height */
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`rounded-control bg-soft motion-safe:animate-pulse ${className}`}
    />
  );
}

export function Skeleton({
  label,
  className = "",
  children,
}: {
  /** e.g. "Loading competitors" */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div aria-busy="true" aria-label={label} className={`skeleton-delay ${className}`}>
      {children}
    </div>
  );
}

/** White card (same border, radius and padding as <Card>) with a title bone. */
export function SkeletonCard({
  className = "",
  title = true,
  children,
}: {
  className?: string;
  title?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-card border border-line bg-surface p-4 md:p-6 ${className}`}>
      {title && <Bone className="mb-5 h-5 w-40" />}
      {children}
    </div>
  );
}

/** The 4 KPI tiles (Overview 04 / Social 06a): label, value, caption. */
export function SkeletonKpis({ className = "" }: { className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4 ${className}`}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-tile border border-line bg-surface p-4 md:p-5"
        >
          <Bone className="h-3 w-20" />
          <Bone className="h-8 w-24" />
          <Bone className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

/** Rows of: optional round/square lead, a line and a short value (leaderboards, lists). */
export function SkeletonRows({
  count,
  lead = "circle",
}: {
  count: number;
  lead?: "circle" | "thumb" | "none";
}) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          {lead === "circle" && <Bone className="size-8 shrink-0 rounded-full" />}
          {lead === "thumb" && <Bone className="size-14 shrink-0" />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Bone className={`h-3.5 ${i % 3 === 0 ? "w-3/4" : i % 3 === 1 ? "w-1/2" : "w-2/3"}`} />
            {lead === "thumb" && <Bone className="h-3 w-1/3" />}
          </div>
          {lead !== "thumb" && <Bone className="h-3.5 w-12 shrink-0" />}
        </div>
      ))}
    </div>
  );
}
