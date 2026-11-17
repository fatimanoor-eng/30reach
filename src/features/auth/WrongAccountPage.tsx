import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import { BlipError } from "../../components/blip/BlipPoses";
import { Button } from "../../components/Button";
import { GoogleG } from "../../components/icons/GoogleG";
import { useAuth } from "../../lib/auth/auth-context";
import { AuthLayout } from "./AuthLayout";

/**
 * 02 Wrong account. Reached when the hook rejected a sign-up (email parsed from its message), or when
 * someone is signed in with a non-team account. The button signs that account out and restarts
 * Google sign-in with the account picker.
 */
export function WrongAccountPage() {
  const { status, user, switchAccount } = useAuth();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "team") return <Navigate to="/overview" replace />;
  if (status === "loading") return <AuthLayout busy />;

  const email =
    (status === "wrongAccount" ? user?.email : null) ??
    (location.state as { email?: string | null } | null)?.email ??
    null;

  async function onClick() {
    setPending(true);
    setError(null);
    const result = await switchAccount();
    if (result.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <AuthLayout>
      <BlipError className="mx-auto h-auto w-28" />
      <h1 className="mt-6 text-heading md:text-heading-lg">That account can’t get in</h1>
      <p className="mx-auto mt-3 max-w-100 text-body text-muted">
        {email ?? "That Google account"} isn’t a Breakthirty account. 30reach only lets in
        @breakthirty.com Google accounts.
      </p>
      <Button fullWidth className="mt-8" icon={<GoogleG />} disabled={pending} onClick={onClick}>
        {pending ? "Opening Google…" : "Try another Google account"}
      </Button>
      {error && (
        <p role="alert" className="mt-4 text-small text-spark">
          {error}
        </p>
      )}
    </AuthLayout>
  );
}
