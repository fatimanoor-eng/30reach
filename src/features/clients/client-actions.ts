import { createContext, useContext } from "react";
import type { ClientSummary } from "../../lib/client-path";

/** Archive (16b), restore and permanent delete (16c / 16d), from the switcher or Client settings. */
export type ClientActions = {
  requestArchive: (client: ClientSummary) => void;
  restore: (client: ClientSummary) => void;
  requestDelete: (client: ClientSummary) => void;
};

export const ClientActionsContext = createContext<ClientActions | null>(null);

export function useClientActions(): ClientActions {
  const value = useContext(ClientActionsContext);
  if (!value) throw new Error("useClientActions must be used inside <ClientActionsProvider>");
  return value;
}
