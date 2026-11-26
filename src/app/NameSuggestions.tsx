import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useToast } from "../components/toast-context";
import { suggestNames } from "../lib/ai/ai-api";
import { useClient, useClientPath } from "../lib/useClient";

/** Clients asked in this tab, so a slow answer or a remount never asks twice. */
const asked = new Set<string>();

/**
 * Short names backfill (27 Nov 2026): the first time a client that has never had names suggested opens, Blip
 * suggests short names and obvious aliases for it and its competitors (one free Groq call, once per client;
 * the server claims it so two tabs can't both run it). Only empty fields are filled; a toast points to them
 * for review. Renders nothing.
 */
export function NameSuggestions() {
  const client = useClient().data;
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const path = useClientPath();
  const id = client && !client.archived_at && !client.names_suggested_at ? client.id : null;

  useEffect(() => {
    if (!id || asked.has(id)) return;
    asked.add(id);
    suggestNames(id)
      .then((r) => {
        void queryClient.invalidateQueries({ queryKey: ["client"] });
        void queryClient.invalidateQueries({ queryKey: ["clients"] });
        if (!r.updated) return;
        void queryClient.invalidateQueries({ queryKey: ["competitors"] });
        void queryClient.invalidateQueries({ queryKey: ["client-details"] });
        toast.show({
          title: `Blip suggested short names for ${r.updated === 1 ? "1 brand" : `${r.updated} brands`}`,
          detail: "They show on chips and pills. Check them in Client settings and Competitors.",
          pose: "idle",
          action: { label: "Review", onClick: () => navigate(path("/competitors")) },
        });
      })
      .catch(() => {
        // Groq busy or down: try again next time the app opens (the server let go of its claim).
        asked.delete(id);
      });
  }, [id, queryClient, toast, navigate, path]);

  return null;
}
