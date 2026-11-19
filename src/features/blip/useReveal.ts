import { useEffect, useRef, useState } from "react";
import { REVEAL_WPS } from "./blip-rules";

/**
 * Words revealed so far (0 … total) at REVEAL_WPS words per second, driven by requestAnimationFrame
 * and the real elapsed time (a background tab catches up instead of stalling). Calls `onDone` once
 * every word is out. Inactive → everything at once.
 */
export function useReveal(total: number, active: boolean, onDone: () => void): number {
  const [shown, setShown] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const n = Math.min(total, 1 + Math.floor(((now - start) * REVEAL_WPS) / 1000));
      setShown(n);
      if (n >= total) done.current();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, total]);

  return active ? shown : total;
}
