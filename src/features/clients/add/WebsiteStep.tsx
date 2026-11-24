import { Globe } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { BlipIdle } from "../../../components/blip/BlipPoses";
import { Button } from "../../../components/Button";
import { clientPath } from "../../../lib/client-path";
import { siteHost } from "../../../lib/client-rules";
import { formatNumber } from "../../../lib/format";
import { useClients } from "../../../lib/useClient";
import { useCredits } from "../../../lib/useCredits";

/**
 * 15b / M14 Website: one big field (focused, URL keyboard; Enter / Go = Scan), the cost up front
 * ("ABOUT 10–12 FIRECRAWL CREDITS · 772 LEFT"), and "No website? Add the details by hand". Invalid text
 * or a website another client uses never costs anything.
 */
export function WebsiteStep({
  initial,
  onScan,
  onManual,
}: {
  initial: string;
  onScan: (website: string) => void;
  onManual: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [tried, setTried] = useState(false);
  const clients = useClients();
  const credits = useCredits();
  const fieldId = useId();
  const msgId = useId();
  const host = siteHost(value);
  const takenBy = host ? clients.data?.find((c) => siteHost(c.website) === host) : undefined;
  const invalid = value.trim() && !host;
  const left =
    credits.status === "ready" ? ` · ${formatNumber(credits.credits.remaining)} left` : "";

  return (
    <div className="mx-auto flex max-w-110 flex-col items-center px-4 py-8 text-center md:max-w-120 md:py-20">
      <BlipIdle className="h-auto w-24 md:w-28" />
      <h1 className="mt-6 text-title md:mt-8">Which client are we adding?</h1>
      <p className="mt-3 text-body-sm text-muted">
        Paste their website. Blip reads it, finds their social accounts and suggests competitors.
        You check everything before it’s saved.
      </p>
      <form
        noValidate
        className="mt-6 flex w-full flex-col gap-3 md:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (host && !takenBy) onScan(`https://${host}`);
        }}
      >
        <label htmlFor={fieldId} className="sr-only">
          Website
        </label>
        <div
          className={`flex min-h-13 flex-1 items-center gap-2 rounded-control border-[1.5px] bg-surface px-3.5 ${
            (tried && invalid) || takenBy ? "border-spark" : "border-ink"
          }`}
        >
          <Globe size={18} aria-hidden="true" className="shrink-0 text-muted" />
          <input
            id={fieldId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="all-the-best.co"
            inputMode="url"
            enterKeyHint="go"
            autoCapitalize="none"
            autoComplete="url"
            spellCheck={false}
            autoFocus
            aria-invalid={(tried && !!invalid) || !!takenBy || undefined}
            aria-describedby={(tried && invalid) || takenBy ? msgId : undefined}
            className="min-w-0 flex-1 bg-transparent py-3 text-body outline-none placeholder:text-muted"
          />
        </div>
        <Button
          type="submit"
          disabled={!value.trim() || !!takenBy}
          className="min-h-13 md:min-h-13"
        >
          Scan website
        </Button>
      </form>
      {(tried && invalid) || takenBy ? (
        <p id={msgId} role="alert" className="mt-2 w-full text-left text-small text-spark-text">
          {takenBy ? (
            <>
              {takenBy.name} already uses {host} ·{" "}
              <Link to={clientPath(takenBy.slug, "/overview")} className="font-medium underline">
                Open it
              </Link>
            </>
          ) : (
            "That doesn’t look like a website address."
          )}
        </p>
      ) : null}
      <p className="mt-4 mono-label text-muted">About 10–12 Firecrawl credits{left}</p>
      <button
        type="button"
        onClick={onManual}
        className="mt-3 inline-flex min-h-11 items-center text-small font-medium text-blue hover:underline md:min-h-8"
      >
        No website? Add the details by hand
      </button>
    </div>
  );
}
