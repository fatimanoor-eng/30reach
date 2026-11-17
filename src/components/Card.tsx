import type { ReactNode } from "react";
import { InfoTip } from "./InfoTip";

/** White card, 1 px line border, radius 12, padding 16–24. Optional title row + ⓘ + action. */
export function Card({
  title,
  info,
  action,
  children,
  className = "",
}: {
  title?: string;
  info?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-line bg-surface p-4 md:p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {title && <h2 className="text-card">{title}</h2>}
            {info && <InfoTip text={info} label={`About ${title ?? "this card"}`} />}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
