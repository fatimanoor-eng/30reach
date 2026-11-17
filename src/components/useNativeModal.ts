import { useEffect, useRef, type MouseEvent, type SyntheticEvent } from "react";

/**
 * Drives a native <dialog> as a modal: showModal() gives focus trapping, Esc, inert page and
 * a backdrop for free. The dialog's single child fills it, so a click whose target is the
 * <dialog> itself can only be a click on the dimmed backdrop.
 */
export function useNativeModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return {
    ref,
    onCancel: (e: SyntheticEvent) => {
      e.preventDefault(); // we close via state so React stays the source of truth
      onClose();
    },
    onClick: (e: MouseEvent<HTMLDialogElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
  };
}
