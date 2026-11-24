/**
 * On / off switch (Client settings platforms, health months; Slice 17c). 40 × 24 track, ink when on;
 * the button around it is 44 px tall on phones. `label` names it for screen readers.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40 md:min-h-8 md:min-w-0"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${checked ? "bg-ink" : "bg-line-strong"}`}
      >
        <span
          className={`absolute left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-4" : ""}`}
        />
      </span>
    </button>
  );
}
