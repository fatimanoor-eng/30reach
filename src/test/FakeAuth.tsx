import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthContext, type AuthValue } from "../lib/auth/auth-context";

export function TestProviders({ auth, children }: { auth: AuthValue; children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthContext value={auth}>{children}</AuthContext>
    </QueryClientProvider>
  );
}
