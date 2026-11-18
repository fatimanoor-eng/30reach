// 09 health-claim check rules (Slice 11). Pure, tested in card-check.test.ts.

import { readComplianceNotes } from "../../lib/ai/ai-api";
import type { CalendarCard } from "./calendar-ui";
import type { CardFields } from "./cards-api";
import type { HealthCheckState } from "./HealthCheck";

type Text = Pick<CardFields, "title" | "hook" | "caption" | "visual_idea">;

/** The text the check reads, as one comparable key (trimmed; empty = missing). */
export const checkKey = (f: Text) =>
  JSON.stringify([f.title, f.hook, f.caption, f.visual_idea].map((v) => v?.trim() ?? ""));

/** The result stored on a card (from an earlier check), or null if it was never checked. */
export function storedCheck(
  card: Pick<CalendarCard, "compliance_status" | "compliance_notes"> | null,
): HealthCheckState | null {
  if (card?.compliance_status === "clear") return { state: "clear" };
  if (card?.compliance_status === "flagged") {
    const issues = readComplianceNotes(card.compliance_notes);
    return issues?.length ? { state: "flagged", issues } : null;
  }
  return null;
}

/**
 * Run the check after this save? Only when the text changed since the last check (or there's no
 * check yet): re-saving a status or date change doesn't spend a Groq request.
 */
export const needsCheck = (fields: Text, checkedKey: string | null) =>
  checkedKey === null || checkKey(fields) !== checkedKey;
