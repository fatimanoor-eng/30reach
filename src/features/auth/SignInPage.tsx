import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import { Button } from "../../components/Button";
import { GoogleG } from "../../components/icons/GoogleG";
import { Logo } from "../../components/Logo";
import { useAuth } from "../../lib/auth/auth-context";
import { supabaseConfigured } from "../../lib/supabase";
import { AuthLayout } from "./AuthLayout";

/** 01 Sign in (desktop) / M01 (mobile). Continue with Google → Supabase Auth Google OAuth. */
export function SignInPage() {
  const { status, signInWithGoogle } = useAuth();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    (location.state as { error?: string } | null)?.error ??
      (supabaseConfigured
        ? null
        : "This build isn't connected to Supabase yet (missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)."),
  );

  if (status === "team") return <Navigate to="/overview" replace />;
  if (status === "wrongAccount") return <Navigate to="/wrong-account" replace />;
  if (status === "loading") return <AuthLayout busy />;

  async function onClick() {
    setPending(true);
    setError(null);
    const result = await signInWithGoogle();
    // On success the browser is already leaving for Google; only errors land here.
    if (result.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="flex items-center justify-center gap-2.5 text-heading md:text-display">
        Sign in to <Logo title="30reach" className="h-[0.66em] w-auto translate-y-[0.04em]" />
      </h1>
      <p className="mx-auto mt-3 max-w-90 text-body text-muted">
        Use your Breakthirty Google account. One <span className="md:hidden">tap</span>
        <span className="hidden md:inline">click</span>, no password.
      </p>
      <Button
        fullWidth
        className="mt-7"
        icon={<GoogleG />}
        disabled={pending || !supabaseConfigured}
        onClick={onClick}
      >
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error && (
        <p role="alert" className="mt-4 text-small text-spark">
          {error}
        </p>
      )}
      <p className="mt-7 text-small text-muted">Any @breakthirty.com Google account can sign in.</p>
    </AuthLayout>
  );
}
