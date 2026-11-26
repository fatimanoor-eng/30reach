import { Check } from "lucide-react";
import type { InputHTMLAttributes } from "react";

/**
 * The one checkbox look (polish round, 25 Nov): 18 px, 4 px radius, a thin ink border and an ink check.
 * `CheckboxBox` is just the drawing (aria-hidden), for controls that are already checkboxes (an idea card
 * in select mode); `Checkbox` is a real, visually hidden <input> + the drawing, meant to sit inside a
 * <label> with its text (the label row is the touch target: give it min-h-11 on phones).
 */
/**
 * `size="lg"` (UI polish 26 Nov, Add client Review): 20 px, a 2 px ink border, and checked = a filled ink box
 * with a white tick, for lists where ticking is the main job.
 */
export function CheckboxBox({
  checked,
  className = "",
  size = "md",
}: {
  checked: boolean;
  className?: string;
  size?: "md" | "lg";
}) {
  const look =
    size === "lg"
      ? `size-5 rounded-[5px] border-2 border-ink ${checked ? "bg-ink text-white" : "bg-surface"}`
      : "size-4.5 rounded-[4px] border border-ink bg-surface text-ink";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center ${look} ${className}`}
    >
      {checked && <Check size={size === "lg" ? 14 : 13} strokeWidth={size === "lg" ? 3 : 2.75} />}
    </span>
  );
}

export function Checkbox({
  checked,
  className = "",
  size = "md",
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "size"> & {
  checked: boolean;
  size?: "md" | "lg";
}) {
  // The real input sits invisibly on top of the drawn box (same size), so a click, a tap, a screen
  // reader and a test all reach the same element; the box draws focus and disabled from it (peer).
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...input}
      />
      <CheckboxBox
        checked={checked}
        size={size}
        className="pointer-events-none peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:opacity-40"
      />
    </span>
  );
}
