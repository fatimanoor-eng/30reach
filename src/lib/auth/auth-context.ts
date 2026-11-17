import { createContext, useContext } from "react";

/**
 * loading      — restoring the session (or finishing the Google redirect)
 * signedOut    — no session
 * team         — signed in with an @breakthirty.com account
 * wrongAccount — signed in, but not a team account (only if the hook was off when they signed up)
 */
export type AuthStatus = "loading" | "signedOut" | "team" | "wrongAccount";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  initials: string;
};

export type AuthValue = {
  status: AuthStatus;
  user: AuthUser | null;
  /** Starts Google sign-in; the page navigates away to Google. */
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Signs out the current account, then starts Google sign-in with the account picker (screen 02). */
  switchAccount: () => Promise<{ error: string | null }>;
};

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

/** Set right before leaving for Google; screen 01b only shows after a fresh sign-in. */
export const FRESH_SIGN_IN_KEY = "30reach:fresh-sign-in";
