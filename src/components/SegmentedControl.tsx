import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Shown but not selectable (e.g. "90 days" until 90-day pulls exist). */
  disabled?: boolean;
  /** Explains a disabled option ("Needs a 90-day pull, coming later"), or names an icon-only one. */
  tooltip?: string;
  /** Accessible name when the label is an icon (tablet platform switch). */
  ariaLabel?: string;
};

/**
 * Segmented control: date range (7/30/90 days), platform switch.
 * Radio-group semantics: one tab stop, arrow keys move the selection (skipping disabled options).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
  fullWidth = false,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  /** Stretch to the container, options share the width equally (M05 Instagram | TikTok). */
  fullWidth?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, index: number) {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    let next = index;
    for (let step = 0; step < options.length; step++) {
      next = (next + delta + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${fullWidth ? "flex w-full" : "inline-flex"} rounded-control bg-soft p-1 ${className}`}
    >
      {options.map((option, i) => {
        const selected = option.value === value;
        const button = (tip?: {
          "aria-describedby": string;
          onToggle: (e: { currentTarget: Element }) => void;
        }) => (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            aria-disabled={option.disabled || undefined}
            aria-describedby={tip?.["aria-describedby"] || undefined}
            tabIndex={selected ? 0 : -1}
            onClick={(e) => (option.disabled ? tip?.onToggle(e) : onChange(option.value))}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`min-h-11 min-w-11 rounded-md px-3 ${fullWidth ? "inline-flex flex-1 items-center justify-center gap-2" : ""} text-body-sm whitespace-nowrap transition-colors md:min-h-8 md:min-w-0 ${
              selected
                ? "bg-surface text-ink"
                : option.disabled
                  ? "cursor-not-allowed text-muted/60"
                  : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
        return option.tooltip ? (
          <Tooltip key={option.value} content={option.tooltip} side="bottom">
            {(tip) => button(tip)}
          </Tooltip>
        ) : (
          button()
        );
      })}
    </div>
  );
}
