import { PLATFORM_BAR, PLATFORM_LABEL, STATUS_LABEL, STATUSES } from "./calendar-ui";
import { AiTag, StatusDot } from "./CardTile";
import { EventToggles } from "./EventToggles";
import { useClientPlatforms } from "./platform-options";
import type { EventKind } from "./events";
import type { EventToggles as Toggles } from "./event-toggles";

const Sep = () => <li aria-hidden="true">·</li>;

/**
 * 08 legend row (tablet and desktop): platform bars (the client's platforms only) · status dots · AI tag,
 * then the SHOW toggles.
 */
export function CalendarLegend({
  toggles,
  onToggle,
}: {
  toggles: Toggles;
  onToggle: (kind: EventKind) => void;
}) {
  const platforms = useClientPlatforms();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      <ul
        aria-label="Legend"
        className="flex flex-wrap items-center gap-x-5 gap-y-2 text-small text-muted"
      >
        {platforms.map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-3 w-[3px] ${PLATFORM_BAR[p]}`} />
            {PLATFORM_LABEL[p]}
          </li>
        ))}
        <Sep />
        {STATUSES.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <StatusDot status={s} size="md" />
            {STATUS_LABEL[s]}
          </li>
        ))}
        <Sep />
        <li className="flex items-center gap-1.5">
          <AiTag />
          Started as an AI idea
        </li>
      </ul>
      <div role="group" aria-label="Show events" className="flex flex-wrap items-center gap-1.5">
        <span aria-hidden="true" className="mono-label text-muted">
          Show
        </span>
        <EventToggles toggles={toggles} onToggle={onToggle} />
      </div>
    </div>
  );
}
