/**
 * The pixelated glow behind the sign-in brand panel (Figma 01 › "Colors", 6982:8940).
 * Figma draws a linear gradient at 34% opacity with a pixelate effect that SVG export can't carry,
 * so we rebuild it: 100 px blocks, each filled with the gradient sampled at the block's centre.
 * Gradient line, stops and opacity are Figma's exact values (frame coordinates, 720 × 900 panel).
 * Illustration colours (part of the art, like Blip) — not UI tokens.
 */

const A = { x: 2274.86, y: 562.845 };
const B = { x: 172.108, y: 1626.73 };
const LAYER_OPACITY = 0.34;
const STOPS: [number, [number, number, number, number]][] = [
  [0.618873, [255, 255, 255, 0]],
  [0.854355, [255, 249, 168, 0.5]],
  [1, [176, 233, 253, 0.8]],
];
const CELL = 100;
const ORIGIN = { x: -50, y: -70 }; // block edges at x = 50, 150, … and y = 30, 130, … as in Figma

function sample(x: number, y: number): string | null {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const t = Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / (dx * dx + dy * dy));
  if (t <= STOPS[0][0]) return null;
  const i = t <= STOPS[1][0] ? 0 : 1;
  const [t0, c0] = STOPS[i];
  const [t1, c1] = STOPS[i + 1];
  const k = (t - t0) / (t1 - t0);
  const [r, g, b, a] = c0.map((v, j) => v + (c1[j] - v) * k);
  const alpha = a * LAYER_OPACITY;
  return alpha < 0.005
    ? null
    : `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${alpha.toFixed(3)})`;
}

const cells: { x: number; y: number; fill: string }[] = [];
for (let y = ORIGIN.y; y < 900; y += CELL) {
  for (let x = ORIGIN.x; x < 720; x += CELL) {
    const fill = sample(x + CELL / 2, y + CELL / 2);
    if (fill) cells.push({ x, y, fill });
  }
}

export function BrandGlow({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 720 900"
      preserveAspectRatio="xMinYMax slice"
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      {cells.map((c) => (
        <rect key={`${c.x},${c.y}`} x={c.x} y={c.y} width={CELL} height={CELL} fill={c.fill} />
      ))}
    </svg>
  );
}
