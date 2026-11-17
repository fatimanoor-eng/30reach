import type { ReactNode } from "react";

type ChipTone = "neutral" | "ok" | "danger" | "flash";

const tones: Record<ChipTone, string> = {
  neutral: "bg-soft text-ink",
  ok: "bg-fresh/10 text-fresh",
  danger: "bg-spark/12 text-spark",
  flash: "bg-flash text-ink",
};

/** Small mono tag: hashtags, tags, filters, statuses. */
export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-5.5 items-center rounded-full px-2 font-mono text-label whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
