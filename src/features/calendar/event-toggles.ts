import { useCallback, useState } from "react";
import type { EventKind } from "./events";

export type EventToggles = Record<EventKind, boolean>;

export const TOGGLES_KEY = "30reach:calendar-events";
const ALL_ON: EventToggles = { holiday: true, health: true, marketing: true };

/** Saved toggles, or all on. Anything unreadable (private mode, old shape) falls back to all on. */
export function readToggles(): EventToggles {
  try {
    const raw = localStorage.getItem(TOGGLES_KEY);
    if (!raw) return ALL_ON;
    const saved = JSON.parse(raw) as Partial<Record<EventKind, unknown>>;
    return {
      holiday: saved.holiday !== false,
      health: saved.health !== false,
      marketing: saved.marketing !== false,
    };
  } catch {
    return ALL_ON;
  }
}

/** Holidays / Health / Marketing show-hide, remembered per person in this browser (localStorage). */
export function useEventToggles() {
  const [toggles, setToggles] = useState<EventToggles>(readToggles);
  const toggle = useCallback((kind: EventKind) => {
    setToggles((current) => {
      const next = { ...current, [kind]: !current[kind] };
      try {
        localStorage.setItem(TOGGLES_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked: remembered for this visit only */
      }
      return next;
    });
  }, []);
  return { toggles, toggle };
}
