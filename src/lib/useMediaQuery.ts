import { useSyncExternalStore } from "react";

/** Breakpoints from tokens.css: md = 768 px (tablet), xl = 1200 px (desktop). */
export const MQ_TABLET_UP = "(min-width: 48rem)";
export const MQ_DESKTOP_UP = "(min-width: 75rem)";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
