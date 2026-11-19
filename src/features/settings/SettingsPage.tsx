import { useState } from "react";
import { PageHeader } from "../../app/PageHeader";
import { useProfile } from "../../lib/auth/useProfile";
import { AccountCard } from "./AccountCard";
import { DataCard } from "./DataCard";
import { TeamCard } from "./TeamCard";
import { UsageCard } from "./UsageCard";

/**
 * 13 Settings (desktop) / More → Settings (phones, single column). Desktop: Team + Data on the
 * left, Free-tier usage + Account in a 440 px column on the right. Below 1200 px: one column.
 * Admin-only actions (roles, remove access, clear pull) are also refused by the server.
 */
export function SettingsPage() {
  const profile = useProfile();
  const isAdmin = profile.data?.role === "admin";
  const [now] = useState(() => Date.now()); // "2 days ago" etc. from one page time
  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <TeamCard isAdmin={isAdmin} now={now} />
          <DataCard isAdmin={isAdmin} />
        </div>
        <div className="flex flex-col gap-4 xl:w-110 xl:shrink-0">
          <UsageCard now={now} />
          <AccountCard isAdmin={isAdmin} />
        </div>
      </div>
    </>
  );
}
