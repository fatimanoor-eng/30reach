import { useContext, useEffect, useRef, type MouseEvent, type SyntheticEvent } from "react";
import { ModalPresenceContext } from "./modal-presence";

/** Exit animations to wait for before closing (styles/index.css › Modal motion). */
const EXIT_ANIMATIONS = new Set(["modal-drawer-out", "modal-sheet-out", "modal-fade-out"]);
const EXIT_FALLBACK_MS = 600; // never leave a modal stuck open if an animation event goes missing

/**
 * When one modal is swapped for another in the same commit (e.g. 05 "Checking credits…" → confirm
 * cost), the new one appears without sliding in again. Set on unmount of an open modal.
 */
let lastSwapOutAt = -Infinity;

/**
 * Drives a native <dialog> as a modal: showModal() gives focus trapping, Esc, inert page and a backdrop
 * for free. The dialog's single child fills it, so a click whose target is the <dialog> itself can only
 * be a click on the dimmed backdrop.
 *
 * Motion: opening is pure CSS (`dialog[open]` keyframes). Closing sets `data-closing`, waits for the exit
 * animation (if the element has one) and only then calls close() — and tells a surrounding
 * <ModalPresence> it may unmount. Components without motion (Dialog) close at once.
 */
export function useNativeModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const presence = useContext(ModalPresenceContext);
  const isOpen = open && (presence?.open ?? true);
  const onExited = presence?.onExited;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOpen) {
      el.removeAttribute("data-closing");
      if (!el.open) {
        if (performance.now() - lastSwapOutAt < 100) el.setAttribute("data-instant", "");
        el.showModal();
      }
      return;
    }
    if (!el.open) {
      onExited?.();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeAttribute("data-closing");
      el.close();
      onExited?.();
    };
    el.removeAttribute("data-instant");
    el.setAttribute("data-closing", "");
    const exits = (el.getAnimations?.({ subtree: true }) ?? []).filter(
      (a) => a instanceof CSSAnimation && EXIT_ANIMATIONS.has(a.animationName),
    );
    if (exits.length === 0) {
      finish();
      return;
    }
    const timer = setTimeout(finish, EXIT_FALLBACK_MS);
    void Promise.all(exits.map((a) => a.finished)).then(finish, finish);
    return () => {
      done = true; // reopened (or unmounted) mid-exit: don't close it behind the user's back
      clearTimeout(timer);
    };
  }, [isOpen, onExited]);

  // Unmounted while still open (swapped for another modal): remember it, see lastSwapOutAt.
  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el?.open) lastSwapOutAt = performance.now();
    };
  }, []);

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
