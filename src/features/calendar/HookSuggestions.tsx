import { BlipThinking } from "../../components/blip/BlipPoses";
import { AI_COPY } from "../../lib/ai/ai-api";

export type HooksState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; hooks: string[] }
  | { state: "failed"; rateLimited: boolean };

/**
 * "Suggest hooks" / "Suggest caption" results under their field (09 / M08). No Figma frame yet
 * (Fatima adds one later): tappable rows (3 hooks, or 2 captions with their line breaks); picking
 * one puts it in the field. Nothing is saved until Save.
 */
export function HookSuggestions({
  value,
  onPick,
  onRetry,
  onHide,
  noun = "hook",
}: {
  /** YouTube cards (18): "title" / "description". */
  noun?: "hook" | "caption" | "title" | "description";
  value: HooksState;
  onPick: (hook: string) => void;
  onRetry: () => void;
  onHide: () => void;
}) {
  if (value.state === "idle") return null;
  if (value.state === "loading")
    return (
      <p role="status" className="mt-2 flex items-center gap-2 text-small text-muted">
        <BlipThinking className="h-7 w-auto shrink-0" />
        Blip’s writing {noun}s…
      </p>
    );
  if (value.state === "failed")
    return (
      <p
        role="alert"
        className="mt-2 flex flex-wrap items-center gap-x-3 text-small text-muted-strong"
      >
        {value.rateLimited ? AI_COPY.rateLimited : AI_COPY.failed}
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 font-medium text-blue hover:underline md:min-h-0"
        >
          Try again
        </button>
      </p>
    );
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <p className="mono-label text-muted">Pick a {noun}</p>
        <button
          type="button"
          onClick={onHide}
          className="-mr-2 min-h-11 min-w-11 px-2 text-small text-muted hover:text-ink md:mr-0 md:min-h-0 md:min-w-0 md:px-0"
        >
          Hide
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {value.hooks.map((h) => (
          <li key={h}>
            <button
              type="button"
              onClick={() => onPick(h)}
              className="min-h-11 w-full rounded-control border border-line px-3.5 py-2.5 text-left text-body-sm whitespace-pre-line hover:border-ink hover:bg-bg"
            >
              {h}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
