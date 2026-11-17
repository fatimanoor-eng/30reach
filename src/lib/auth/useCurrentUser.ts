import { useAuth } from "./auth-context";
import { roleLabel, useProfile } from "./useProfile";

/** Who's signed in, for the shell: Google name/email + role from the profiles row. */
export function useCurrentUser() {
  const { user } = useAuth();
  const profile = useProfile();
  const name = profile.data?.full_name ?? user?.name ?? user?.email ?? "";
  return {
    name,
    email: user?.email ?? "",
    initials: user?.initials ?? "",
    role: roleLabel(profile.data?.role),
  };
}
