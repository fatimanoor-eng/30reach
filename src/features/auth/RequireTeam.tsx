import { Navigate, Outlet } from "react-router";
import { useAuth } from "../../lib/auth/auth-context";

/**
 * Protected routes. UI gating only — the real protection is RLS (is_team()) on every table.
 * While the session restores, render the plain app background so nothing flashes.
 */
export function RequireTeam() {
  const { status } = useAuth();
  if (status === "loading") return <div className="min-h-dvh bg-bg" aria-busy="true" />;
  if (status === "signedOut") return <Navigate to="/sign-in" replace />;
  if (status === "wrongAccount") return <Navigate to="/wrong-account" replace />;
  if (status === "removed") return <Navigate to="/access-removed" replace />;
  return <Outlet />;
}
