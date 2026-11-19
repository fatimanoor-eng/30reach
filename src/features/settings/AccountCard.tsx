import { LogOut } from "lucide-react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { useAuth } from "../../lib/auth/auth-context";
import { useCurrentUser } from "../../lib/auth/useCurrentUser";

/** 13 Account: who's signed in (name, email, role) and Sign out. */
export function AccountCard({ isAdmin }: { isAdmin: boolean }) {
  const me = useCurrentUser();
  const { signOut } = useAuth();
  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <p className="text-body-sm font-medium">Signed in as {me.name}</p>
          <p className="max-w-full truncate font-mono text-small text-muted">{me.email}</p>
          <Chip tone={isAdmin ? "ink" : "neutral"} className="mt-1.5">
            {isAdmin ? "Admin" : "Member"}
          </Chip>
        </div>
        <Button variant="secondary" icon={<LogOut size={16} />} onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </Card>
  );
}
