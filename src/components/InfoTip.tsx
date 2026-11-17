import { Info } from "lucide-react";
import { Tooltip } from "./Tooltip";

/** ⓘ next to a card title. Explanations live here, not in text blocks. */
export function InfoTip({ text, label = "More info" }: { text: string; label?: string }) {
  return (
    <Tooltip content={text} side="bottom">
      {(trigger) => (
        <button
          type="button"
          aria-label={label}
          aria-describedby={trigger["aria-describedby"]}
          onClick={trigger.onToggle}
          // 44 px hit area on mobile without changing the visual size.
          className="-m-3 inline-flex size-11 items-center justify-center rounded-full text-muted hover:text-ink md:-m-1 md:size-6"
        >
          <Info size={16} />
        </button>
      )}
    </Tooltip>
  );
}
