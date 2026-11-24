import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useToast } from "../../components/toast-context";
import { ideaCardTitle, plannedLabel, type Idea } from "./idea-rules";
import { planIdea, PlanError } from "./ideas-api";
import { useClientPath } from "../../lib/useClient";

/**
 * One-click "Plan on {date}" for a Plan {month} idea (14b tiles, 08 idea panel): plan_idea on Blip's
 * suggested day with the idea's platform / format → an Idea card (origin 'ai') and the idea marked
 * Planned, in one transaction. A person's explicit action, never automatic (CLAUDE.md rule 6).
 */
export function usePlanOnDay() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const path = useClientPath();
  return useMutation({
    mutationFn: ({ idea, day }: { idea: Idea; day: string }) =>
      planIdea({
        ideaId: idea.id,
        date: day,
        platform: idea.platform,
        format: idea.format,
        title: ideaCardTitle(idea),
      }),
    onSuccess: (card) => {
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
      toast.show({
        title: `Planned for ${plannedLabel(card.date)}`,
        detail: "Added to the calendar as an Idea card.",
        pose: "success",
        action: {
          label: "Open",
          onClick: () => navigate(path(`/calendar?date=${card.date}&card=${card.id}`)),
        },
      });
    },
    onError: (err: Error) => {
      if (err instanceof PlanError && err.reason !== "other")
        void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.show({
        title: err instanceof PlanError ? err.message : "Couldn’t plan it. Try again.",
        pose: "error",
      });
    },
  });
}
