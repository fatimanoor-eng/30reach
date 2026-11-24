import { useClient } from "../../lib/useClient";
import { DEFAULT_EVENT_RULES, type EventRules } from "./events";

/**
 * The current client's calendar rules (Slice 17e): its country (holidays, marketing dates) and whether
 * health months show. Until the client loads: the defaults (US, health months on).
 */
export function useEventRules(): EventRules {
  const client = useClient().data;
  return {
    country: client?.country ?? DEFAULT_EVENT_RULES.country,
    healthMonths: client?.health_months ?? DEFAULT_EVENT_RULES.healthMonths,
  };
}
