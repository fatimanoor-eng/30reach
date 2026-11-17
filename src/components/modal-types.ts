import type { ReactNode } from "react";
import type { ButtonVariant } from "./Button";

export type ModalAction = {
  label: string;
  variant?: ButtonVariant;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
};

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
  /** "center" for status cards (05b pulling, M04); default "start" for confirm dialogs. */
  align?: "start" | "center";
  /** Dialog width: "md" (440 px, confirm) or "lg" (520 px, 05b pulling card). Sheets are always full width. */
  size?: "md" | "lg";
  /** Shown at the start of the button row on tablet/desktop (e.g. "Credits used so far · 71"). */
  footer?: ReactNode;
};
