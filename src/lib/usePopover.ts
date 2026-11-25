import { useEffect, useId, useRef, useState } from "react";

/**
 * A small popover's open state. Closes on Esc (focus back on the trigger) and on a click outside
 * `wrapRef`. Used by the client switcher and the Overview "See all" menu.
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const toggle = () => setOpen((o) => !o);
  const close = () => setOpen(false);
  return { open, toggle, close, wrapRef, triggerRef, panelId };
}
