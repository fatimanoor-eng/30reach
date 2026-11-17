import { X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import { useNativeModal } from "./useNativeModal";

/**
 * Drawer (DESIGN_SYSTEM › Drawer, Figma 07b): right side, 480 px, dimmed page, from 768 px up.
 * Slides in from the right (250 ms, ease-out) over a fading backdrop and slides back out on close
 * (styles/index.css › Modal motion; fade only with reduced motion). Wrap a conditionally rendered drawer
 * in <ModalPresence> so it can finish sliding out before it unmounts.
 * On mobile it's a full-screen page. Header (title + close) and footer (actions) stay put; the body scrolls.
 * Native <dialog>: focus trap, Esc and inert page for free.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const descId = useId();
  const modal = useNativeModal(open, onClose);
  // showModal() focuses the first focusable element (the close button). A field marked
  // data-autofocus (e.g. the handle "Fix handle" points at) gets focus instead. Runs after the
  // modal effect above, because effects run in order.
  const { ref } = modal;
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [open, ref]);
  return (
    <dialog
      {...modal}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-motion="drawer"
      className="m-0 h-dvh w-full bg-surface text-ink md:ml-auto md:w-120 md:shadow-xl"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:px-7 md:pt-7">
          <div className="min-w-0">
            <h2 id={titleId} className="text-heading">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-3 text-body-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-soft hover:text-ink"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-7">{children}</div>
        {footer && (
          <footer className="border-t border-line px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:mx-7 md:px-0 md:pb-7">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
