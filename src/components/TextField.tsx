import { Check } from "lucide-react";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

export type FieldTone = "default" | "ok" | "error";

const border: Record<FieldTone, string> = {
  default: "border-line focus-within:border-ink",
  ok: "border-fresh",
  error: "border-spark",
};

/**
 * Labelled text input (Figma 07b): mono label, 44 px field with an optional leading icon, and one line
 * under it — a hint, "Found · public account" (ok, with ✓) or an error (red). The message is linked to the
 * input with aria-describedby; errors also set aria-invalid.
 */
export const TextField = forwardRef<
  HTMLInputElement,
  {
    label: string;
    icon?: ReactNode;
    message?: string;
    tone?: FieldTone;
    className?: string;
  } & Omit<InputHTMLAttributes<HTMLInputElement>, "className">
>(function TextField({ label, icon, message, tone = "default", className = "", ...input }, ref) {
  const id = useId();
  const msgId = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block mono-label text-muted">
        {label}
      </label>
      <div
        className={`flex min-h-11 items-center gap-2 rounded-control border bg-surface px-3 ${border[tone]}`}
      >
        {icon && (
          <span aria-hidden="true" className="shrink-0 text-muted">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={tone === "error" || undefined}
          aria-describedby={message ? msgId : undefined}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-body outline-none placeholder:text-muted"
          {...input}
        />
      </div>
      {message && (
        <p
          id={msgId}
          className={`mt-2 flex items-center gap-1.5 text-small ${
            tone === "ok" ? "text-fresh" : tone === "error" ? "text-spark" : "text-muted"
          }`}
        >
          {tone === "ok" && <Check size={14} aria-hidden="true" />}
          {message}
        </p>
      )}
    </div>
  );
});
