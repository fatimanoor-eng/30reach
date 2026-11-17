import { useId } from "react";
import { Button } from "./Button";
import type { ModalProps } from "./modal-types";
import { useNativeModal } from "./useNativeModal";

/**
 * Centred dialog, radius 16, dimmed page (Figma 07c).
 * Confirm pattern: illustration (Blip/Error), title naming the thing, one sentence, Cancel + red verb.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  illustration,
  children,
  primary,
  cancelLabel = "Cancel",
  align = "start",
  size = "md",
  footer,
  illustrationSize,
}: ModalProps) {
  const center = align === "center";
  const big = (illustrationSize ?? (center ? "lg" : "sm")) === "lg";
  const titleId = useId();
  const descId = useId();
  const modal = useNativeModal(open, onClose);

  return (
    <dialog
      {...modal}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={`m-auto w-[calc(100%-2rem)] rounded-dialog bg-surface text-ink shadow-xl ${size === "lg" ? "max-w-130" : "max-w-110"}`}
    >
      <div className={`flex flex-col gap-3 p-7 ${center ? "text-center" : ""}`}>
        {illustration && (
          <div className={`mb-1 ${big ? "w-28" : "w-16"} ${center ? "mx-auto" : ""}`}>
            {illustration}
          </div>
        )}
        <h2 id={titleId} className="text-heading">
          {title}
        </h2>
        {description && (
          <p id={descId} className="text-body-sm text-muted">
            {description}
          </p>
        )}
        {children}
        {(primary || cancelLabel || footer) && (
          <div
            className={`mt-3 flex items-center gap-2 text-left ${center && !footer ? "justify-center" : "justify-end"}`}
          >
            {footer && <div className="mr-auto">{footer}</div>}
            {cancelLabel && (
              <Button variant="secondary" onClick={onClose}>
                {cancelLabel}
              </Button>
            )}
            {primary && (
              <Button
                variant={primary.variant ?? "primary"}
                icon={primary.icon}
                disabled={primary.disabled}
                onClick={primary.onClick}
              >
                {primary.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
