import type { ReactNode } from "react";
import type { ButtonVariant } from "./Button";

export type ModalAction = { label: string; variant?: ButtonVariant; onClick: () => void };

/** Shared props for Dialog, BottomSheet and ResponsiveDialog (confirm pattern). */
export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** e.g. <BlipError /> above the title */
  illustration?: ReactNode;
  children?: ReactNode;
  primary?: ModalAction;
  /** Set to null to hide the Cancel button. */
  cancelLabel?: string | null;
};
