import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase, supabaseConfigured } from "../supabase";
import { AuthContext, FRESH_SIGN_IN_KEY, type AuthStatus, type AuthUser } from "./auth-context";
import { initialsFor, isTeamEmail, TEAM_DOMAIN } from "./domain";

function toUser(session: Session | null): AuthUser | null {
  const u = session?.user;
  if (!u?.email) return null;
  const meta = u.user_metadata ?? {};
  const name: string | null = meta.full_name ?? meta.name ?? null;
  return {
    id: u.id,
    email: u.email.toLowerCase(),
    name,
    firstName: meta.given_name ?? name?.split(/\s+/)[0] ?? null,
    initials: initialsFor(name, u.email),
  };
}

function statusFor(user: AuthUser | null): AuthStatus {
  if (!user) return "signedOut";
  return isTeamEmail(user.email) ? "team" : "wrongAccount";
}

function rememberFreshSignIn() {
  try {
    sessionStorage.setItem(FRESH_SIGN_IN_KEY, "1");
  } catch {
    /* private mode: 01b just won't show */
  }
}

async function startGoogleSignIn(): Promise<{ error: string | null }> {
  if (!supabaseConfigured) return { error: "30reach isn't connected to Supabase in this build." };
  rememberFreshSignIn();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/welcome`,
      // `hd` only pre-filters Google's account picker. Security is the auth hook + RLS.
      queryParams: { hd: TEAM_DOMAIN, prompt: "select_account" },
    },
  });
  return { error: error?.message ?? null };
}

/**
 * Has an admin removed this team account? Asks the database (is_team() also checks the removed
 * flag). If the check itself fails (network), let them in: RLS still refuses a removed person's
 * every read and write, so this only decides which screen to show.
 */
async function isRemoved(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_team");
    return !error && data === false;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: AuthStatus; user: AuthUser | null }>({
    status: supabaseConfigured ? "loading" : "signedOut",
    user: null,
  });
  // The access check for the signed-in team user (by id), so a token refresh doesn't re-ask.
  const [access, setAccess] = useState<{ userId: string; removed: boolean } | null>(null);
  const teamUserId = state.status === "team" ? state.user?.id : undefined;
  useEffect(() => {
    if (!teamUserId || access?.userId === teamUserId) return;
    let live = true;
    void isRemoved().then((removed) => live && setAccess({ userId: teamUserId, removed }));
    return () => {
      live = false;
    };
  }, [teamUserId, access?.userId]);
  const status: AuthStatus =
    state.status !== "team"
      ? state.status
      : access?.userId !== teamUserId
        ? "loading"
        : access?.removed
          ? "removed"
          : "team";

  useEffect(() => {
    if (!supabaseConfigured) return;
    // Fires INITIAL_SESSION once restored (including after the Google redirect), then on every change.
    // Keep this callback synchronous — no Supabase calls inside it (supabase-js guidance).
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = toUser(session);
      setState({ status: statusFor(user), user });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      status,
      signInWithGoogle: startGoogleSignIn,
      signOut: async () => {
        await supabase.auth.signOut({ scope: "local" });
      },
      switchAccount: async () => {
        await supabase.auth.signOut({ scope: "local" });
        return startGoogleSignIn();
      },
    }),
    [state, status],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
