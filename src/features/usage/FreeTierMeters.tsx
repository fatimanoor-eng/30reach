import { formatNumber, formatShortDate, creditsFraction, creditsTotal } from "../../lib/format";
import { useCredits, creditsLeft } from "../../lib/useCredits";
import { useGroqMeter, useUsageSizes } from "../settings/settings-api";
import {
  DB_LIMIT_BYTES,
  fill,
  formatBytes,
  GROQ_DAY_LIMIT_FALLBACK,
  groqToday,
  STORAGE_LIMIT_BYTES,
} from "../settings/settings-rules";
import { runningLow } from "./usage-rules";

/**
 * 17 / M20 free-tier meters, moved from Settings (13): Firecrawl credits left (live, 0 credits, cached
 * 5 min), Groq requests left today (from the last AI response), database and storage size. Four cards in a
 * row; two per row on phones. Under 10% left → amber "Running low".
 */
export function FreeTierMeters({ now }: { now: number }) {
  const credits = useCredits();
  const groq = useGroqMeter();
  const sizes = useUsageSizes();
  const c = credits.status === "ready" ? credits.credits : null;
  const g = groq.data !== undefined ? groqToday(groq.data, now) : undefined;
  const s = sizes.data;
  const groqLimit = g?.limit ?? GROQ_DAY_LIMIT_FALLBACK;

  return (
    <section
      aria-label="Free-tier meters"
      className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4"
    >
      <MeterCard
        label="Firecrawl"
        value={c ? creditsLeft(c.remaining, c.plan) : null}
        fraction={c ? creditsFraction(c.remaining, creditsTotal(c.remaining, c.plan) ?? 0) : null}
        low={c ? runningLow(c.remaining, creditsTotal(c.remaining, c.plan) ?? 0) : false}
        tone="flash"
        caption={
          credits.status === "error"
            ? "Couldn’t reach Firecrawl."
            : `Credits${c?.resetsAt ? ` · resets ${formatShortDate(c.resetsAt)}` : ""}`
        }
        retry={credits.status === "error" ? credits.retry : undefined}
      />
      <MeterCard
        label="Groq"
        value={
          g === undefined
            ? null
            : `${formatNumber(g ? g.limit - g.used : groqLimit)} left of ${formatNumber(groqLimit)}`
        }
        fraction={g === undefined ? null : g ? (g.limit - g.used) / g.limit : 1}
        low={g ? runningLow(g.limit - g.used, g.limit) : false}
        caption={
          groq.isError ? "Couldn’t read the Groq meter." : "Requests today · resets at midnight UTC"
        }
        retry={groq.isError ? () => void groq.refetch() : undefined}
      />
      <MeterCard
        label="Database"
        value={s ? `${formatBytes(s.databaseBytes)} of ${formatBytes(DB_LIMIT_BYTES)}` : null}
        fraction={s ? 1 - fill(s.databaseBytes, DB_LIMIT_BYTES) : null}
        used
        low={s ? runningLow(DB_LIMIT_BYTES - s.databaseBytes, DB_LIMIT_BYTES) : false}
        caption={sizes.isError ? "Couldn’t read the size." : "Supabase free tier"}
        retry={sizes.isError ? () => void sizes.refetch() : undefined}
      />
      <MeterCard
        label="Storage"
        value={s ? `${formatBytes(s.storageBytes)} of ${formatBytes(STORAGE_LIMIT_BYTES)}` : null}
        fraction={s ? 1 - fill(s.storageBytes, STORAGE_LIMIT_BYTES) : null}
        used
        low={s ? runningLow(STORAGE_LIMIT_BYTES - s.storageBytes, STORAGE_LIMIT_BYTES) : false}
        caption={sizes.isError ? "Couldn’t read the size." : "Thumbnails, idea images, logos"}
        retry={sizes.isError ? () => void sizes.refetch() : undefined}
      />
    </section>
  );
}

/**
 * One meter card. `fraction` = share LEFT (Firecrawl, Groq) — or, with `used`, the bar shows what's used
 * (database, storage) like the frame.
 */
function MeterCard({
  label,
  value,
  fraction,
  used = false,
  low,
  caption,
  retry,
  tone = "ink",
}: {
  label: string;
  /** null while loading */
  value: string | null;
  fraction: number | null;
  used?: boolean;
  low: boolean;
  caption: string;
  retry?: () => void;
  tone?: "ink" | "flash";
}) {
  const bar = fraction === null ? 0 : Math.min(1, Math.max(0, used ? 1 - fraction : fraction));
  return (
    <div
      className="flex min-w-0 flex-col gap-2.5 rounded-card border border-line bg-surface p-4 md:p-5"
      aria-busy={value === null || undefined}
    >
      {/* Phones: the value goes under the label (two cards per row are narrow). */}
      <div className="flex flex-col gap-1 xl:flex-row xl:items-baseline xl:justify-between xl:gap-3">
        <p className="mono-label text-muted">{label}</p>
        <p className="font-mono text-small break-words xl:whitespace-nowrap">{value ?? "—"}</p>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(bar * 100)}
        aria-valuetext={value ?? "Loading"}
        className="h-1.5 overflow-hidden rounded-full bg-soft"
      >
        <div
          className={`h-full rounded-full ${low ? "bg-amber" : tone === "flash" ? "bg-flash" : "bg-ink"}`}
          style={{ width: `${bar * 100}%` }}
        />
      </div>
      <p className={`text-small ${low ? "font-medium text-amber-text" : "text-muted"}`}>
        {low ? "Running low · " : ""}
        {caption}
        {retry && (
          <>
            {" "}
            <button
              type="button"
              onClick={retry}
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
