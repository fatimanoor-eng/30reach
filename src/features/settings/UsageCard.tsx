import { Card } from "../../components/Card";
import { formatNumber, formatShortDate } from "../../lib/format";
import { creditsLeft, useCredits } from "../../lib/useCredits";
import { useGroqMeter, useUsageSizes } from "./settings-api";
import {
  ago,
  DB_LIMIT_BYTES,
  fill,
  formatBytes,
  GROQ_DAY_LIMIT_FALLBACK,
  groqToday,
  STORAGE_LIMIT_BYTES,
} from "./settings-rules";

/**
 * 13 Free-tier usage (annotation: Firecrawl credit-usage endpoint; Groq x-ratelimit-remaining-requests
 * per day from the last response; database pg_database_size(); storage vs 1 GB, INTEGRATIONS §6).
 * Meters show used / limit like Figma. Firecrawl fills in Flash, the others in ink.
 */
export function UsageCard({ now }: { now: number }) {
  const credits = useCredits();
  const groq = useGroqMeter();
  const sizes = useUsageSizes();

  const c = credits.status === "ready" ? credits.credits : null;
  const g = groq.data !== undefined ? groqToday(groq.data, now) : undefined;
  const s = sizes.data;
  const retrySizes = () => void sizes.refetch();

  return (
    <Card title="Free-tier usage">
      <div className="flex flex-col">
        {/* Firecrawl reads as credits LEFT, the same as the sidebar ("919 left of 1,000"); the bar is
            what's left, in Flash. Groq, Database and Storage stay used / limit. */}
        <Meter
          label="Firecrawl credits"
          used={c ? c.remaining : null}
          limit={c?.plan ?? 1000}
          value={(left, plan) => creditsLeft(left, plan)}
          tone="flash"
          note={
            credits.status === "error"
              ? { text: "Couldn’t reach Firecrawl.", retry: credits.retry }
              : {
                  text: `${c?.resetsAt ? `Resets ${formatShortDate(c.resetsAt)}. ` : ""}Free plan can’t buy top-ups.`,
                }
          }
        />
        <Meter
          label="Groq requests today"
          used={g ? g.used : g === null ? 0 : null}
          limit={g?.limit ?? GROQ_DAY_LIMIT_FALLBACK}
          value={(u, l) =>
            g === null ? `— / ${formatNumber(l)}` : `${formatNumber(u)} / ${formatNumber(l)}`
          }
          note={
            groq.isError
              ? { text: "Couldn’t read the Groq meter.", retry: () => void groq.refetch() }
              : {
                  text: g
                    ? `Ask Blip, plans, health checks, hooks and captions · as of ${ago(g.asOf, now)}.`
                    : "No AI requests yet. Updates after each Ask Blip, plan, check or suggestion.",
                }
          }
        />
        <Meter
          label="Database"
          used={s ? s.databaseBytes : null}
          limit={DB_LIMIT_BYTES}
          value={(u, l) => `${formatBytes(u)} / ${formatBytes(l)}`}
          note={
            sizes.isError
              ? { text: "Couldn’t read the size.", retry: retrySizes }
              : { text: "Supabase free tier." }
          }
        />
        <Meter
          label="Storage"
          used={s ? s.storageBytes : null}
          limit={STORAGE_LIMIT_BYTES}
          value={(u, l) => `${formatBytes(u)} / ${formatBytes(l)}`}
          note={
            sizes.isError
              ? { text: "Couldn’t read the size.", retry: retrySizes }
              : { text: "Post thumbnails and idea images (compressed)." }
          }
        />
      </div>
      <div className="mt-4 rounded-tile bg-bg px-4 py-3.5">
        <p className="text-small font-medium">Free database pauses after 7 quiet days</p>
        <p className="mt-1 text-small text-muted">
          If 30reach won’t load after a break, restore the project from the Supabase dashboard.
          Nothing is lost.
        </p>
      </div>
    </Card>
  );
}

function Meter({
  label,
  used,
  limit,
  value,
  note,
  tone = "ink",
}: {
  label: string;
  /** null while loading */
  used: number | null;
  limit: number;
  value: (used: number, limit: number) => string;
  note: { text: string; retry?: () => void };
  tone?: "ink" | "flash";
}) {
  const pct = used === null ? 0 : fill(used, limit) * 100;
  return (
    <div
      className="flex flex-col gap-2 border-t border-line py-3 first:pt-3"
      aria-busy={used === null || undefined}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body-sm font-medium">{label}</p>
        <p className="font-mono text-small whitespace-nowrap">
          {used === null ? "—" : value(used, limit)}
        </p>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used ?? undefined}
        aria-valuetext={used === null ? "Loading" : value(used, limit)}
        className="h-1.5 overflow-hidden rounded-full bg-soft"
      >
        <div
          className={`h-full rounded-full ${tone === "flash" ? "bg-flash" : "bg-ink"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-small text-muted">
        {note.text}
        {note.retry && (
          <>
            {" "}
            <button
              type="button"
              onClick={note.retry}
              className="min-h-11 text-blue hover:underline md:min-h-0"
            >
              Try again
            </button>
          </>
        )}
      </p>
    </div>
  );
}
