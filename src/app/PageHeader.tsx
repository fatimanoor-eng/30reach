import type { ReactNode } from "react";
import { useClient } from "../lib/useClient";

/**
 * Page header: mono breadcrumb (tablet/desktop) + page title.
 * Title 30 px on mobile, 40 px Display from tablet up (DESIGN_SYSTEM › Typography).
 */
export function PageHeader({
  title,
  mobileTitle,
  crumbs = [],
  description,
  actions,
  titleLeading,
}: {
  title: string;
  /** Shorter title below 768 px (e.g. "Social" for the Instagram/TikTok pages, M05). */
  mobileTitle?: string;
  /** Breadcrumb after the client name, e.g. ["Instagram", "Compare"] */
  crumbs?: string[];
  /** One line under the title (e.g. 07 "6 brands tracked. Changes apply on the next Refresh.") */
  description?: ReactNode;
  actions?: ReactNode;
  /** Before the title, e.g. the calendar's month arrows + Today (08): fixed-width controls go first
   *  so they don't move when the title's width changes. */
  titleLeading?: ReactNode;
}) {
  const client = useClient();
  // Client name from the database; left out of the trail until it has loaded.
  const trail = [...(client.data ? [client.data.name] : []), ...(crumbs.length ? crumbs : [title])];
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
        <div className="flex items-center gap-3">
          {titleLeading}
          <h1 className="text-title md:text-display">
            {mobileTitle ? (
              <>
                <span className="md:hidden">{mobileTitle}</span>
                <span className="hidden md:inline">{title}</span>
              </>
            ) : (
              title
            )}
          </h1>
        </div>
        {description && <p className="mt-2 text-body text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
