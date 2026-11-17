import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BlipError, BlipIdle, BlipSuccess } from "./blip/BlipPoses";
import { TOAST_DURATION_MS, ToastContext, type ToastInput } from "./toast-context";

const poses = { success: BlipSuccess, error: BlipError, idle: BlipIdle };

/**
 * Toast (Figma 05d): ink card, Blip pose + text + action. One at a time; a new toast replaces the old.
 * Auto-hides after ~8 s; hovering or focusing it pauses the timer.
 * Desktop/tablet: bottom-right. Mobile: bottom, above the tab bar.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const [paused, setPaused] = useState(false);

  const show = useCallback((t: ToastInput) => setToast({ ...t, id: Date.now() }), []);
  const dismiss = useCallback(() => setToast(null), []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  useEffect(() => {
    if (!toast || paused) return;
    const timer = window.setTimeout(dismiss, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast, paused, dismiss]);

  const Pose = toast?.pose ? poses[toast.pose] : null;

  return (
    <ToastContext value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center md:inset-x-auto md:right-6 md:bottom-6"
      >
        {toast && (
          <div
            key={toast.id}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className="on-dark pointer-events-auto flex w-full max-w-120 items-center gap-3 rounded-card bg-ink py-3 pr-2 pl-4 text-white shadow-xl"
          >
            {Pose && <Pose className="h-auto w-12 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium">{toast.title}</p>
              {toast.detail && (
                <p className="mt-0.5 font-mono text-label text-sidebar-text">{toast.detail}</p>
              )}
            </div>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss();
                }}
                className="min-h-11 shrink-0 px-2 text-body-sm text-flash hover:underline md:min-h-9"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-sidebar-text hover:text-white md:size-8"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </ToastContext>
  );
}
