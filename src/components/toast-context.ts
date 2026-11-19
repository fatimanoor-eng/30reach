import { createContext, useContext } from "react";

export type ToastInput = {
  title: string;
  /** Mono detail line, e.g. "228 posts · 112 credits used · 476 left" */
  detail?: string;
  pose?: "success" | "error" | "idle";
  /**
   * The Success pose jumps (once) only for real celebrations, e.g. a pull that finished; other
   * success toasts ("Saved", "Planned…") show it still, so the app doesn't bounce all day.
   */
  celebrate?: boolean;
  action?: { label: string; onClick: () => void };
  /** How long it stays (default TOAST_DURATION_MS); hovering or focusing it pauses the timer. */
  durationMs?: number;
  /**
   * Called once when the toast goes: its action was used, it timed out, ✕ was pressed, or another
   * toast replaced it. ("Deleted the idea · Undo" removes the image only when it's not "action".)
   */
  onDismiss?: (reason: ToastDismissReason) => void;
};

export type ToastDismissReason = "action" | "timeout" | "closed" | "replaced";

export type ToastApi = { show: (toast: ToastInput) => void; dismiss: () => void };

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export const TOAST_DURATION_MS = 8000;
