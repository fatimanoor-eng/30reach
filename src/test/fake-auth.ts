import { vi } from "vitest";
import type { AuthStatus, AuthValue } from "../lib/auth/auth-context";

/** Test-only auth state: pick a status and an email, get spies for the actions. */
export function fakeAuth(status: AuthStatus, email = "fatima.noor@breakthirty.com"): AuthValue {
  const signedIn = status === "team" || status === "wrongAccount" || status === "removed";
  return {
    status,
    user: signedIn
      ? { id: "user-1", email, name: "Fatima Noor", firstName: "Fatima", initials: "FN" }
      : null,
    signInWithGoogle: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => {}),
    switchAccount: vi.fn(async () => ({ error: null })),
  };
}
