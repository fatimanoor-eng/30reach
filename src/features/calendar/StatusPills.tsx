import { useRef, type KeyboardEvent } from "react";
import { STATUS_DOT, STATUS_LABEL, STATUS_PILL, STATUSES, type CardStatus } from "./calendar-ui";

/**
 * Soft status pills (09 / M08): each status in its own soft colour with its dot; the current one is
 * white with a 1.5 px ink outline and medium text. A radio group: one click sets it; ← → ↑ ↓ move and
 * set (Home / End too); only the current pill is in the Tab order. Wraps on phones.
 */
export function StatusPills({
  value,
  onChange,
  labelledBy,
}: {
  value: CardStatus;
  onChange: (status: CardStatus) => void;
  labelledBy: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (to: number) => {
    const i = (to + STATUSES.length) % STATUSES.length;
    onChange(STATUSES[i]);
    refs.current[i]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? STATUSES.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    move(to);
  };

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-x-1.5">
      {STATUSES.map((s, i) => {
        const on = s === value;
        return (
          <button
            key={s}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(s)}
            onKeyDown={(e) => onKey(e, i)}
            className="group inline-flex min-h-11 items-center md:min-h-0"
          >
            <span
              className={`inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2.5 text-small text-ink ${
                on
                  ? "bg-surface font-medium shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
                  : `${STATUS_PILL[s]} group-hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]`
              }`}
            >
              <span aria-hidden="true" className={`size-[7px] rounded-full ${STATUS_DOT[s]}`} />
              {STATUS_LABEL[s]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
