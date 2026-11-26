// Add client progress for this browser tab (Slice 17d): a reload or a locked phone picks up where it was,
// and nothing already paid for is scanned again. sessionStorage only (never shared); wrapped so a blocked
// storage never breaks the flow.
import type { Platform } from "../../../lib/platforms";
import type { ReviewDraft, SiteScan, Suggestion } from "./add-client-rules";

export type FlowStep = "website" | "scanning" | "manual" | "unreadable" | "review" | "first-pull";

export type FlowState = {
  step: FlowStep;
  /** One id per Add client run (Slice 17f): the scan's usage rows are claimed by the new client. */
  scanId: string;
  website: string;
  scan: SiteScan | null;
  /** Closest rivals (Discovery 2.0). */
  suggestions: Suggestion[] | null;
  /** Big in your space (Discovery 2.0): read only when ticked in Review. */
  big?: Suggestion[] | null;
  accountsRead: number;
  /** Firecrawl credits this run has spent so far. */
  credits: number;
  draft: ReviewDraft | null;
  unreadable: { reason: "no_answer" | "error_page"; credits: number } | null;
  /** The manual form's entries (polish: Back keeps them). */
  manual?: ManualValues | null;
  created: {
    id: string;
    slug: string;
    name: string;
    competitors: number;
    platforms: Platform[];
  } | null;
};

export type ManualValues = {
  name: string;
  website: string;
  country: string;
  industry: string;
  accounts: Record<Platform, string>;
};

export const START: FlowState = {
  step: "website",
  scanId: "",
  website: "",
  scan: null,
  suggestions: null,
  big: null,
  accountsRead: 0,
  credits: 0,
  draft: null,
  unreadable: null,
  created: null,
};

const KEY = "30reach:add-client";

export function loadFlow(): FlowState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return START;
    const s = JSON.parse(raw) as FlowState;
    return s && typeof s === "object" && typeof s.step === "string" ? { ...START, ...s } : START;
  } catch {
    return START;
  }
}

export function saveFlow(s: FlowState) {
  try {
    if (s.step === "website" && !s.website && !s.scan) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* blocked or full: the flow still works, it just won't survive a reload */
  }
}

export function clearFlow() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* blocked */
  }
}

/** PullProvider starts the first pull when it opens this client (15e "Pull now"). */
export const START_PULL_KEY = (clientId: string) => `30reach:start-pull:${clientId}`;
