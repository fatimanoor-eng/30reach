import { ChevronDown } from "lucide-react";
import { useId, type SelectHTMLAttributes } from "react";

/** Labelled native select, same look as TextField (mono label, 44 px field). Slice 17c. */
export function SelectField({
  label,
  options,
  className = "",
  ...select
}: {
  label: string;
  options: { value: string; label: string }[];
  className?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block mono-label text-muted">
        {label}
      </label>
      <div className="relative flex min-h-11 items-center rounded-control border border-line bg-surface focus-within:border-ink">
        <select
          id={id}
          className="min-h-11 w-full appearance-none rounded-control bg-transparent py-2.5 pr-9 pl-3 text-body outline-none"
          {...select}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 text-muted"
        />
      </div>
    </div>
  );
}
