/** "~369K on Instagram" / "~1.2M on Instagram" (Big in your space; approximate, from a search snippet). */
export function followersLabel(count: number): string {
  const f = (n: number, unit: string) =>
    `${n >= 100 ? Math.round(n) : Math.round(n * 10) / 10}${unit}`;
  const short =
    count >= 1_000_000
      ? f(count / 1_000_000, "M")
      : count >= 1000
        ? f(count / 1000, "K")
        : `${count}`;
  return `~${short} on Instagram`;
}
