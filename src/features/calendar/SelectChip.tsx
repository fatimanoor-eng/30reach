import { CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type ChipOption<T extends string> = { value: T; label: string; icon?: ReactNode };

/** The chip's look (Figma "Select chip — states"): placeholder grey · selected · open (bg + ink border). */
const chip = (open: boolean) =>
  `inline-flex items-center gap-[7px] rounded-control border py-[7px] pr-2 pl-2.5 text-small font-medium whitespace-nowrap ${
    open ? "border-ink bg-bg" : "border-line-strong bg-surface group-hover:border-ink"
  }`;

/**
 * Select chip with a small menu (09 card header: platform, format). A listbox: ↑ ↓ move, Enter / Space
 * pick, Esc closes without closing the drawer, Tab or a click outside closes. On phones the button is
 * 44 px tall around the visible chip.
 */
export function SelectChip<T extends string>({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled = false,
}: {
  /** what it sets, for screen readers ("Platform") */
  label: string;
  value: T | null;
  options: ChipOption<T>[];
  placeholder: string;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? null;

  const openMenu = () => {
    if (disabled || options.length === 0) return;
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const pick = (i: number) => {
    onChange(options[i].value);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape") {
      e.preventDefault(); // keep the drawer open: Esc only closes the menu
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selected?.label ?? "not set"}`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openMenu();
          }
        }}
        className="group inline-flex min-h-11 items-center disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
      >
        <span className={chip(open)}>
          {selected?.icon}
          <span className={selected ? "text-ink" : "text-muted"}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown size={13} aria-hidden="true" className="text-muted" />
        </span>
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className="absolute top-full left-0 z-20 mt-1 flex min-w-36 flex-col gap-0.5 rounded-[10px] border border-line bg-surface p-1.5 shadow-lg outline-none"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[6px] py-2 pr-6 pl-2.5 text-small md:min-h-0 ${
                i === active ? "bg-bg" : ""
              } ${o.value === value ? "font-medium" : ""}`}
            >
              {o.icon}
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Date chip: same look, calendar icon + "Fri 4 Dec". The browser's own date picker opens on click or
 * tap (a native date input sits invisibly on top), so it works with keyboards and screen readers too.
 */
export function DateChip({
  value,
  text,
  onChange,
}: {
  value: string;
  /** "Fri 4 Dec" */
  text: string;
  onChange: (value: string) => void;
}) {
  return (
    <span className="group relative inline-flex min-h-11 items-center md:min-h-0">
      <span
        aria-hidden="true"
        className={`${chip(false)} group-focus-within:border-ink group-focus-within:bg-bg`}
      >
        <CalendarDays size={15} />
        <span className="text-ink">{text}</span>
        <ChevronDown size={13} className="text-muted" />
      </span>
      <input
        type="date"
        aria-label="Date"
        required
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            /* older browsers open it themselves */
          }
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </span>
  );
}
