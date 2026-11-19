import { useState } from "react";
import { Navigate } from "react-router";
import { BlipError } from "../../components/blip/BlipPoses";
import { Button } from "../../components/Button";
import { useAuth } from "../../lib/auth/auth-context";
import { AuthLayout } from "./AuthLayout";

/**
 * Access removed (Slice 12, no frame; same layout as 02 with Blip/Error). An admin removed this
 * @breakthirty.com account in Settings › Team: is_team() is false, so RLS refuses everything. Signing
 * in again lands here too (the sign-up hook only runs once). An admin can restore access.
 */
export function AccessRemovedPage() {
  const { status, user, signOut } = useAuth();
  const [pending, setPending] = useState(false);

  if (status === "team") return <Navigate to="/overview" replace />;
  if (status === "loading") return <AuthLayout busy />;
  if (status !== "removed") return <Navigate to="/sign-in" replace />;

  return (
    <AuthLayout>
      <BlipError className="mx-auto h-auto w-28" />
      <h1 className="mt-6 text-heading md:text-heading-lg">Your access was removed</h1>
      <p className="mx-auto mt-3 max-w-100 text-body text-muted">
        {user?.email ?? "This account"} can’t use 30reach any more. Ask an admin to restore it.
      </p>
      <Button
        fullWidth
        className="mt-8"
        disabled={pending}
        onClick={() => {
          setPending(true);
          void signOut();
        }}
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
    </AuthLayout>
  );
}
