import type { ReactNode } from "react";
import { BlipError } from "./blip/BlipPoses";
import { ResponsiveDialog } from "./ResponsiveDialog";

/**
 * Confirm pattern for destructive actions (DESIGN_SYSTEM › Dialog): Remove competitor, Clear pull,
 * Delete idea. Blip/Error, a title naming the thing, one sentence, Cancel + a red button repeating the
 * verb — all centred. Dialog from 768 px up, bottom sheet below (which slides up / down).
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy = false,
  disabled = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** e.g. "Remove Found?" */
  title: string;
  description: string;
  /** e.g. "Remove Found" */
  confirmLabel: string;
  onConfirm: () => void;
  /** while the action runs: the red button is disabled (the caller also ignores Cancel / Esc) */
  busy?: boolean;
  disabled?: boolean;
  /** e.g. an error line */
  children?: ReactNode;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      align="center"
      illustrationSize="sm"
      illustration={<BlipError className="h-auto w-full" />}
      title={title}
      description={description}
      primary={{
        label: confirmLabel,
        variant: "danger",
        disabled: busy || disabled,
        onClick: onConfirm,
      }}
    >
      {children}
    </ResponsiveDialog>
  );
}
