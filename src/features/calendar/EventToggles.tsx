import { Check } from "lucide-react";
import { EVENT_BG, EVENT_TOGGLE_LABEL, TOGGLE_ORDER } from "./calendar-ui";
import type { EventKind } from "./events";
import type { EventToggles as Toggles } from "./event-toggles";

/**
 * Holidays / Health / Marketing checkbox chips (Figma 08 "SHOW", M07). The visible chip is 24 px; the
 * button around it is 44 px tall on mobile for the touch target.
 */
export function EventToggles({
  toggles,
  onToggle,
}: {
  toggles: Toggles;
  onToggle: (kind: EventKind) => void;
}) {
  return (
    <>
      {TOGGLE_ORDER.map((kind) => {
        const on = toggles[kind];
        return (
          <button
            key={kind}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onToggle(kind)}
            className="group inline-flex min-h-11 shrink-0 items-center md:min-h-7"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-2.5 pl-1.5 text-small font-medium group-hover:border-muted">
              <span
                aria-hidden="true"
                className={`inline-flex size-3.5 items-center justify-center rounded-[4px] ${on ? "bg-ink text-white" : "border border-muted bg-surface"}`}
              >
                {on && <Check size={10} strokeWidth={3} />}
              </span>
              <span aria-hidden="true" className={`h-2 w-3 rounded-[2px] ${EVENT_BG[kind]}`} />
              {EVENT_TOGGLE_LABEL[kind]}
            </span>
          </button>
        );
      })}
    </>
  );
}
