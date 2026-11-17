import { createContext, useContext } from "react";

export type ToastInput = {
  title: string;
  /** Mono detail line, e.g. "228 posts · 112 credits used · 476 left" */
  detail?: string;
  pose?: "success" | "error" | "idle";
  action?: { label: string; onClick: () => void };
};

export type ToastApi = { show: (toast: ToastInput) => void; dismiss: () => void };

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export const TOAST_DURATION_MS = 8000;
