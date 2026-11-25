import type { Platform } from "../../lib/platforms";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useAskBlip } from "../../app/ask-blip-context";
import { formatShortDate } from "../../lib/format";
import { WHAT_CHANGED } from "../blip/blip-rules";
import { notPulledNote } from "./metrics";

const DISMISSED_KEY = "30reach:whats-new-dismissed"; // = id of the latest pull it was dismissed for

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * 05e What's new — latest pull vs the previous one. "✕" hides it until the next pull (remembered per
 * browser). The 05d toast's "See what's new" navigates here with state { whatsNew: true } → scrolls to it.
 */
export function WhatsNewBar({
  latestPullId,
  previousStartedAt,
  summary,
  notPulled = [],
}: {
  latestPullId: string;
  previousStartedAt: string;
  summary: string[];
  /** 18b: platforms not pulled this time (carried over), left out of the comparison. */
  notPulled?: Platform[];
}) {
  const askBlip = useAskBlip();
  const location = useLocation();
  const ref = useRef<HTMLElement>(null);
  const [dismissedFor, setDismissedFor] = useState(readDismissed);
  const fromToast = (location.state as { whatsNew?: boolean } | null)?.whatsNew === true;
  const hidden = dismissedFor === latestPullId && !fromToast;

  useEffect(() => {
    if (fromToast) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [fromToast]);

  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, latestPullId);
    } catch {
      /* private mode: hides for this visit only */
    }
    setDismissedFor(latestPullId);
    if (fromToast) window.history.replaceState({}, ""); // forget the toast's "show it" flag
  }

  return (
    <section
      ref={ref}
      id="whats-new"
      aria-label="What's new since the last pull"
      className="on-dark mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-ink py-3 pr-2 pl-4 text-white"
    >
      <span className="rounded-sm bg-flash px-1.5 py-0.5 font-mono text-label text-ink uppercase">
        New since {formatShortDate(previousStartedAt)}
      </span>
      <p className="min-w-0 flex-1 text-body-sm">
        {summary.join(" · ")}
        {notPulled.length > 0 && (
          <span className="block text-small text-sidebar-text">{notPulledNote(notPulled)}</span>
        )}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => askBlip(WHAT_CHANGED)}
          className="min-h-11 px-2 text-body-sm text-flash hover:underline md:min-h-9"
        >
          Ask Blip what changed
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide until the next pull"
          className="inline-flex size-11 items-center justify-center rounded-control text-sidebar-text hover:text-white md:size-9"
        >
          <X size={16} />
        </button>
      </div>
    </section>
  );
}
