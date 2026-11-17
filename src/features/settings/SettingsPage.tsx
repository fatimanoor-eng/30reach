import { LogOut } from "lucide-react";
import { Button } from "../../components/Button";
import { useAuth } from "../../lib/auth/auth-context";
import { PlaceholderPage } from "../PlaceholderPage";

/** Placeholder until Slice 12. Sign out lives here on tablet/desktop (mobile: More tab). */
export function SettingsPage() {
  const { signOut } = useAuth();
  return (
    <PlaceholderPage
      title="Settings"
      slice={12}
      text="Team and roles, free-tier usage meters, data export and clearing a pull."
      actions={
        <Button variant="secondary" icon={<LogOut size={16} />} onClick={() => void signOut()}>
          Sign out
        </Button>
      }
    />
  );
}
