import { createContext, useContext } from "react";
import type { Platform } from "../../lib/pulls/api";
import type { PullProgress } from "../../lib/pulls/run-pull";

/**
 * idle        — nothing running; Refresh opens 05
 * starting    — pull-start in flight
 * running     — pull in progress; cardOpen = 05b card visible (else 05c progress on the button)
 * interrupted — a running pull that isn't being driven (reload / Firecrawl hiccup) → Resume
 */
export type PullUiState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running"; pullId: string; progress: PullProgress | null; cardOpen: boolean }
  | { kind: "interrupted"; pullId: string; progress: PullProgress | null };

export type PullApi = {
  state: PullUiState;
  clientId: string | null;
  refreshOpen: boolean;
  /** Refresh button: opens 05 (idle), the 05b card (running) or resumes (interrupted). */
  onRefreshClick: () => void;
  closeRefresh: () => void;
  start: (platforms: Platform[]) => Promise<void>;
  resume: () => void;
  hideCard: () => void;
};

export const PullContext = createContext<PullApi | null>(null);

export function usePull(): PullApi {
  const value = useContext(PullContext);
  if (!value) throw new Error("usePull must be used inside <PullProvider>");
  return value;
}

/** 0–100 for the button and ring. */
export function percentOf(state: PullUiState): number {
  return state.kind === "running" || state.kind === "interrupted"
    ? Math.round((state.progress?.fraction ?? 0) * 100)
    : 0;
}
