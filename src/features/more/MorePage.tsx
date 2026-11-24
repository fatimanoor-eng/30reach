import { ChevronRight, SlidersVertical, Users, Gauge } from "lucide-react";
import { Link, Navigate } from "react-router";
import { PageHeader } from "../../app/PageHeader";
import { Avatar } from "../../components/Avatar";
import { CreditsMeter } from "../../components/CreditsMeter";
import { MQ_TABLET_UP, useMediaQuery } from "../../lib/useMediaQuery";
import { useAuth } from "../../lib/auth/auth-context";
import { useCurrentUser } from "../../lib/auth/useCurrentUser";
import { useCompetitors } from "../../lib/useCompetitors";
import { plural } from "../../lib/format";
import { useCredits } from "../../lib/useCredits";
import { useClientPath } from "../../lib/useClient";

/** Mobile "More" tab (Figma M12): Competitors, Settings, credits, account. Tablet/desktop use the nav. */
export function MorePage() {
  const tabletUp = useMediaQuery(MQ_TABLET_UP);
  const path = useClientPath();
  const me = useCurrentUser();
  const credits = useCredits();
  const competitors = useCompetitors();
  const rows = [
    {
      to: path("/competitors"),
      icon: Users,
      title: "Competitors",
      text: competitors.data
        ? `${plural(competitors.data.length, "brand")} · add, edit, remove`
        : "Add, edit, remove",
    },
    { to: path("/usage"), icon: Gauge, title: "Usage", text: "Free-tier meters, cost per client" },
    { to: path("/settings"), icon: SlidersVertical, title: "Settings", text: "Team, data" },
  ];
  const { signOut } = useAuth();
  if (tabletUp) return <Navigate to={path("/overview")} replace />;

  return (
    <>
      <PageHeader title="More" />
      <div className="flex flex-col gap-4">
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {rows.map(({ to, icon: Icon, title, text }) => (
            <li key={to}>
              <Link to={to} className="flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-soft">
                <Icon size={22} aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-body font-medium">{title}</span>
                  <span className="block text-small text-muted">{text}</span>
                </span>
                <ChevronRight size={18} className="text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

        <CreditsMeter state={credits} variant="card" />

        <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4">
          <Avatar initials={me.initials} tone="user" size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium">{me.name}</p>
            <p className="truncate font-mono text-small text-muted">{me.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-11 px-2 text-body-sm text-spark hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
