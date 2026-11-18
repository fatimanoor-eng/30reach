import type { ReactNode } from "react";
import { BlipError, BlipIdle } from "./blip/BlipPoses";

/** Empty state: Blip (Idle, or Error when something failed) + mono label + title + one line + actions. */
export function EmptyState({
  label,
  title,
  text,
  actions,
  pose = "idle",
}: {
  pose?: "idle" | "error";
  label: string;
  title: string;
  text: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center md:py-16">
      {pose === "error" ? (
        <BlipError className="h-auto w-24 md:w-28" />
      ) : (
        <BlipIdle className="h-auto w-24 md:w-28" />
      )}
      <p className="mono-label text-muted">{label}</p>
      <h2 className="text-card">{title}</h2>
      <p className="max-w-96 text-body-sm text-muted">{text}</p>
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
