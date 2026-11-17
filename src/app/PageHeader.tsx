import type { ReactNode } from "react";
import { sampleClient } from "../lib/sample-data";

/**
 * Page header: mono breadcrumb (tablet/desktop) + page title.
 * Title 30 px on mobile, 40 px Display from tablet up (DESIGN_SYSTEM › Typography).
 */
export function PageHeader({
  title,
  crumbs = [],
  actions,
}: {
  title: string;
  /** Breadcrumb after the client name, e.g. ["Instagram", "Compare"] */
  crumbs?: string[];
  actions?: ReactNode;
}) {
  const trail = [sampleClient.name, ...(crumbs.length ? crumbs : [title])];
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
      <div>
        <nav aria-label="Breadcrumb" className="mb-2 hidden md:block">
          <ol className="flex gap-2 mono-label text-muted">
            {trail.map((crumb, i) => (
              <li key={crumb} className="flex gap-2">
                {i > 0 && <span aria-hidden="true">/</span>}
                <span aria-current={i === trail.length - 1 ? "page" : undefined}>{crumb}</span>
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="text-title md:text-display">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
