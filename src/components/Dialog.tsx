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
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const modal = useNativeModal(open, onClose);

  return (
    <dialog
      {...modal}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className="m-auto w-[calc(100%-2rem)] max-w-110 rounded-dialog bg-surface text-ink shadow-xl"
    >
      <div className="flex flex-col gap-3 p-7">
        {illustration && <div className="mb-1 w-16">{illustration}</div>}
        <h2 id={titleId} className="text-heading">
          {title}
        </h2>
        {description && (
          <p id={descId} className="text-body-sm text-muted">
            {description}
          </p>
        )}
        {children}
        {(primary || cancelLabel) && (
          <div className="mt-3 flex justify-end gap-2">
            {cancelLabel && (
              <Button variant="secondary" onClick={onClose}>
                {cancelLabel}
              </Button>
            )}
            {primary && (
              <Button variant={primary.variant ?? "primary"} onClick={primary.onClick}>
                {primary.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
