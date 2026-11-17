import {
  useCallback,
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

type Side = "top" | "right" | "bottom";

const GAP = 8;
const HALF_MAX = 136; // half of max-w-64 (256 px) + 8 px edge margin

/**
 * Small ink tooltip. Opens on hover, keyboard focus, and tap (via `onToggle`); Esc or scrolling closes it.
 * Uses fixed positioning so it isn't clipped by scrolling rows (brand pills on mobile).
 * The trigger is rendered by `children(...)` so it can set aria-describedby.
 */
export function Tooltip({
  content,
  side = "top",
  children,
  enabled = true,
  className = "",
}: {
  content: ReactNode;
  side?: Side;
  enabled?: boolean;
  children: (props: {
    "aria-describedby": string;
    onToggle: (e: { currentTarget: Element }) => void;
  }) => ReactElement;
  className?: string;
}) {
  const id = useId();
  const [style, setStyle] = useState<CSSProperties | null>(null);

  /** Position next to `el` (the hovered wrapper or the tapped trigger). */
  const show = useCallback(
    (el: Element) => {
      if (!enabled) return;
      const r = el.getBoundingClientRect();
      const clampX = (x: number) => Math.min(Math.max(x, HALF_MAX), window.innerWidth - HALF_MAX);
      const cx = clampX(r.left + r.width / 2);
      setStyle(
        side === "right"
          ? { top: r.top + r.height / 2, left: r.right + GAP + 4, transform: "translateY(-50%)" }
          : side === "bottom"
            ? { top: r.bottom + GAP, left: cx, transform: "translateX(-50%)" }
            : { top: r.top - GAP, left: cx, transform: "translate(-50%, -100%)" },
      );
    },
    [side, enabled],
  );

  const hide = useCallback(() => setStyle(null), []);

  useEffect(() => {
    if (!style) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [style, hide]);

  return (
    <span
      className={`inline-flex ${className}`}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={hide}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={hide}
      onKeyDown={(e) => e.key === "Escape" && hide()}
    >
      {children({
        "aria-describedby": enabled ? id : "",
        onToggle: (e) => (style ? hide() : show(e.currentTarget)),
      })}
      <span
        role="tooltip"
        id={id}
        style={style ?? undefined}
        className={`pointer-events-none fixed z-50 w-max max-w-64 rounded-control bg-ink px-2.5 py-1.5 text-small text-white ${style && enabled ? "" : "hidden"}`}
      >
        {content}
      </span>
    </span>
  );
}
