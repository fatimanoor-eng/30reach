import { ArrowLeft } from "lucide-react";

/**
 * Add client's "← Back" (polish 2): a quiet text button at the bottom-left of a step, the main action on
 * the right. Step 1 has none; Close stays top right. Keeps what was entered; nothing is scanned again.
 */
export function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-body-sm font-medium text-muted hover:bg-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 md:min-h-10"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      Back
    </button>
  );
}
