import { forwardRef, type HTMLAttributes } from "react";
import { cardMeta, PLATFORM_BAR, STATUS_DOT, STATUS_LABEL, type CalendarCard } from "./calendar-ui";

/** The black "AI" tag: this card started as an AI idea (origin = 'ai'). */
export function AiTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-3.5 items-center rounded-[2px] bg-ink px-[3px] font-mono text-label leading-none text-white ${className}`}
    >
      AI
    </span>
  );
}

export function StatusDot({
  status,
  size = "sm",
}: {
  status: CalendarCard["status"];
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ${size === "sm" ? "size-1.5" : "size-2"} ${STATUS_DOT[status]}`}
    />
  );
}

/**
 * Calendar post card (Figma component 6904:1938) inside a month-grid day: 3 px platform bar,
 * status dot + "IG · REEL", optional AI tag, title. A button that opens the 09 drawer; the month grid
 * makes it draggable too.
 */
export const CardTile = forwardRef<
  HTMLButtonElement,
  { card: CalendarCard; dragging?: boolean } & HTMLAttributes<HTMLButtonElement>
>(function CardTile({ card, dragging = false, className = "", ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`relative flex w-full min-w-0 overflow-hidden rounded-[6px] border border-line bg-surface py-1.5 pr-1.5 pl-2.5 text-left hover:border-muted ${dragging ? "shadow-lg" : ""} ${className}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] ${PLATFORM_BAR[card.platform ?? "none"]}`}
      />
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="flex min-w-0 items-center gap-[3px]">
          <StatusDot status={card.status} />
          <span className="sr-only">{STATUS_LABEL[card.status]}, </span>
          <span className="truncate mono-label tracking-normal text-muted">{cardMeta(card)}</span>
          {card.origin === "ai" && (
            <>
              <AiTag className="shrink-0" />
              <span className="sr-only">, started as an AI idea, </span>
            </>
          )}
        </span>
        <span className="line-clamp-3 text-label font-medium tracking-normal text-ink normal-case">
          {card.title}
        </span>
      </span>
    </button>
  );
});
