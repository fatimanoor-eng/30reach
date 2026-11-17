import { useId, useRef, useState, type PointerEvent } from "react";
import { Button } from "./Button";
import type { ModalProps } from "./modal-types";
import { useNativeModal } from "./useNativeModal";

const CLOSE_DISTANCE = 96; // px dragged down before letting go closes the sheet

/**
 * Mobile bottom sheet (Figma M03): floating card, 12 px side/bottom margin, radius 24, drag handle,
 * full-width primary, Cancel as text. Closes on swipe down, tap on the dim area, or Esc.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  illustration,
  children,
  primary,
  cancelLabel = "Cancel",
  align = "start",
  footer,
}: ModalProps) {
  const center = align === "center";
  const titleId = useId();
  const descId = useId();
  const modal = useNativeModal(open, onClose);
  const start = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    start.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (start.current !== null) setDragY(Math.max(0, e.clientY - start.current));
  }
  function onPointerUp() {
    if (start.current === null) return;
    start.current = null;
    if (dragY > CLOSE_DISTANCE) onClose();
    setDragY(0);
  }

  return (
    <dialog
      {...modal}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      className={`mx-3 mt-auto mb-[max(0.75rem,env(safe-area-inset-bottom))] w-[calc(100%-1.5rem)] rounded-sheet bg-surface text-ink shadow-xl ${dragY ? "" : "transition-transform"}`}
    >
      <div className="max-h-[85dvh] overflow-y-auto px-5 pb-5">
        {/* Drag area: handle + title. touch-none so the browser doesn't scroll instead. */}
        <div
          className="-mx-5 cursor-grab touch-none px-5 pt-3"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
          {illustration && (
            <div className={center ? "mx-auto mb-3 w-28" : "mb-3 w-16"}>{illustration}</div>
          )}
          <h2 id={titleId} className={`text-heading ${center ? "text-center" : ""}`}>
            {title}
          </h2>
        </div>
        {description && (
          <p id={descId} className={`mt-2 text-body-sm text-muted ${center ? "text-center" : ""}`}>
            {description}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-4">{footer}</div>}
        <div className="mt-5 flex flex-col gap-1">
          {primary && (
            <Button
              variant={primary.variant ?? "primary"}
              icon={primary.icon}
              disabled={primary.disabled}
              fullWidth
              onClick={primary.onClick}
            >
              {primary.label}
            </Button>
          )}
          {cancelLabel && (
            <Button variant="text" fullWidth onClick={onClose}>
              {cancelLabel}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
