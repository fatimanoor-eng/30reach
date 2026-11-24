import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Card } from "../../components/Card";
import { useClientPath } from "../../lib/useClient";

/**
 * Settings (13): the free-tier meters moved to Usage (17, Slice 17f). This card points there and keeps
 * the one thing worth knowing about the free database.
 */
export function UsageLinkCard() {
  const path = useClientPath();
  return (
    <Card title="Free-tier usage">
      <p className="text-body-sm text-muted">
        Firecrawl, Groq, database and storage meters, and what each client costs, are on the Usage
        page.
      </p>
      <Link
        to={path("/usage")}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-small font-medium text-blue hover:underline md:min-h-8"
      >
        Open Usage
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
      <div className="mt-4 rounded-tile bg-bg px-4 py-3.5">
        <p className="text-small font-medium">Free database pauses after 7 quiet days</p>
        <p className="mt-1 text-small text-muted">
          If 30reach won’t load after a break, restore the project from the Supabase dashboard.
          Nothing is lost.
        </p>
      </div>
    </Card>
  );
}
