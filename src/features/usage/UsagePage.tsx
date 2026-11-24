import { useMemo, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { PageHeader } from "../../app/PageHeader";
import { ClientMark } from "../../app/ClientMark";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { LoadError } from "../../components/LoadError";
import { clientPath, lastPullLabel } from "../../lib/client-path";
import { formatNumber, formatShortDate, plural } from "../../lib/format";
import { useCredits } from "../../lib/useCredits";
import { todayIso } from "../calendar/events/dates";
import { formatBytes } from "../settings/settings-rules";
import { FreeTierMeters } from "./FreeTierMeters";
import { useUsageOverview } from "./usage-api";
import {
  avgPerPull,
  billingLabel,
  shortWeekLabels,
  axisMax,
  chartSeries,
  lastWeeks,
  otherCredits,
  type Series,
  tableRows,
  tooltipLines,
  totals,
  type UsageClient,
  weekBars,
} from "./usage-rules";

/** Neutral shades, never brand colours (17): the top 2 clients, then "Demo + other". */
const SHADE = ["bg-ink", "bg-muted", "bg-line-dash"] as const;

/**
 * 17 / M20 Usage (Slice 17f), team-wide: opened from the sidebar / rail credits meter (phones: More →
 * Usage). Free-tier meters (moved from Settings), what each client cost this billing month, and Firecrawl
 * credits by week for the last 8 weeks (stacked, neutral; hover / tap a client to highlight it).
 */
export function UsagePage() {
  const [now] = useState(() => Date.now());
  const today = todayIso(new Date(now));
  const credits = useCredits();
  const c = credits.status === "ready" ? credits.credits : null;
  const weeks = useMemo(() => lastWeeks(today), [today]);
  // Billing month = Firecrawl's period; until it loads (or if it fails) the calendar month.
  const from = c?.periodStart ?? (credits.status === "loading" ? null : `${today.slice(0, 8)}01`);
  const overview = useUsageOverview(from, weeks[0]);
  const [active, setActive] = useState<string | null>(null); // highlighted series key

  const period = billingLabel(c?.periodStart ?? null, c?.resetsAt ?? null);
  const billing = period ? `Billing month ${period}` : null;
  const resets = c?.resetsAt ? `Firecrawl resets ${formatShortDate(c.resetsAt)}.` : "";

  return (
    <>
      <PageHeader
        title="Usage"
        root="Breakthirty"
        description={`Free-tier meters for the whole team, and what each client costs.${billing ? ` ${billing} ·` : ""} ${resets}`.trim()}
      />
      <div className="flex flex-col gap-4">
        <FreeTierMeters now={now} />
        {overview.isError ? (
          <LoadError title="Usage didn’t load" onRetry={() => void overview.refetch()} />
        ) : !overview.data ? (
          <div aria-busy="true" aria-label="Loading usage" className="flex flex-col gap-4">
            <div className="h-64 rounded-card border border-line bg-surface motion-safe:animate-pulse" />
            <div className="h-72 rounded-card border border-line bg-surface motion-safe:animate-pulse" />
          </div>
        ) : (
          <UsageBody
            clients={overview.data.clients}
            weeksShown={weeks}
            rows={overview.data.weeks}
            firecrawlUsed={c ? c.plan - c.remaining : null}
            active={active}
            setActive={setActive}
          />
        )}
      </div>
    </>
  );
}

function UsageBody({
  clients,
  weeksShown,
  rows,
  firecrawlUsed,
  active,
  setActive,
}: {
  clients: UsageClient[];
  weeksShown: string[];
  rows: Parameters<typeof weekBars>[2];
  firecrawlUsed: number | null;
  active: string | null;
  setActive: (k: string | null) => void;
}) {
  const sorted = tableRows(clients);
  const sum = totals(clients);
  const other = otherCredits(firecrawlUsed, sum.credits);
  const series = chartSeries(clients, rows);
  const seriesOf = (id: string) => series.find((s) => s.ids.includes(id))?.key ?? null;
  const top = Math.max(1, ...clients.map((c) => c.credits));
  return (
    <>
      <Card title="Per client · this billing month">
        <ClientTable
          rows={sorted}
          top={top}
          sum={sum}
          seriesOf={seriesOf}
          active={active}
          setActive={setActive}
        />
        <ClientList rows={sorted} top={top} sum={sum} seriesOf={seriesOf} setActive={setActive} />
        {other > 0 && (
          <p className="mt-3 font-mono text-label text-muted uppercase">
            Other: {plural(other, "credit")} (spent outside 30reach)
          </p>
        )}
      </Card>
      <WeeklyChart
        weeksShown={weeksShown}
        series={series}
        rows={rows}
        active={active}
        setActive={setActive}
      />
    </>
  );
}

type RowsProps = {
  rows: UsageClient[];
  top: number;
  sum: ReturnType<typeof totals>;
  seriesOf: (id: string) => string | null;
  setActive: (k: string | null) => void;
};

function Bar({ value, top }: { value: number; top: number }) {
  return (
    <span aria-hidden="true" className="h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-soft">
      <span
        className="block h-full rounded-full bg-ink"
        style={{ width: `${(value / top) * 100}%` }}
      />
    </span>
  );
}

function Tag({ c }: { c: UsageClient }) {
  if (c.archived_at) return <Chip className="uppercase">Archived</Chip>;
  if (c.is_demo)
    return (
      <Chip tone="flash" className="uppercase">
        Demo
      </Chip>
    );
  return null;
}

const dash = (n: number | null) => (n ? formatNumber(n) : "—");

/** Tablet / desktop table (17). Click a row → that client's Overview. */
function ClientTable({
  rows,
  top,
  sum,
  seriesOf,
  active,
  setActive,
}: RowsProps & { active: string | null }) {
  const navigate = useNavigate();
  const head = "py-2 pr-3 text-left font-mono text-label font-normal text-muted uppercase";
  const cell = "py-3 pr-3 text-body-sm";
  return (
    <div className="-mx-4 hidden overflow-x-auto px-4 md:-mx-6 md:px-6 xl:block">
      <table className="w-full min-w-240 border-collapse">
        <thead>
          <tr className="border-b border-line">
            <th className={head}>Client</th>
            <th className={head}>Credits</th>
            <th className={head}>Pulls</th>
            <th className={head}>Last pull</th>
            <th className={head}>Avg / pull</th>
            <th className={head}>Checks</th>
            <th className={head}>Scans</th>
            <th className={head}>Storage</th>
            <th className={head}>Posts · ideas · cards</th>
            <th className={head}>Blip</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const key = seriesOf(c.id);
            const dim = !!c.archived_at || (active !== null && key !== active);
            return (
              <tr
                key={c.id}
                tabIndex={0}
                aria-label={`${c.name}: ${plural(c.credits, "credit")} this month. Open its Overview`}
                onClick={() => navigate(clientPath(c.slug, "/overview"))}
                onKeyDown={(e) => e.key === "Enter" && navigate(clientPath(c.slug, "/overview"))}
                onPointerEnter={() => setActive(key)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(key)}
                onBlur={() => setActive(null)}
                className={`cursor-pointer border-b border-line transition-opacity hover:bg-bg ${dim ? "opacity-50" : ""}`}
              >
                <td className={cell}>
                  <span className="flex items-center gap-3">
                    <ClientMark client={c} />
                    <span className="truncate">{c.name}</span>
                    <Tag c={c} />
                  </span>
                </td>
                <td className={cell}>
                  <span className="flex items-center gap-3">
                    <Bar value={c.credits} top={top} />
                    <span className="font-mono">{formatNumber(c.credits)}</span>
                  </span>
                </td>
                <td className={`${cell} font-mono`}>{c.is_demo ? "Pulls off" : dash(c.pulls)}</td>
                <td className={cell}>
                  {c.last_pull ? lastPullLabel(c.last_pull, new Date(), { short: true }) : "—"}
                </td>
                <td className={`${cell} font-mono`}>{dash(avgPerPull(c))}</td>
                <td className={`${cell} font-mono`}>{dash(c.check_credits)}</td>
                <td className={`${cell} font-mono`}>{dash(c.scan_credits)}</td>
                <td className={`${cell} font-mono`}>
                  {c.storage_bytes ? formatBytes(c.storage_bytes) : "—"}
                </td>
                <td className={`${cell} font-mono`}>
                  {c.posts} · {c.ideas} · {c.cards}
                </td>
                <td className={`${cell} font-mono`}>{dash(c.groq_requests)}</td>
              </tr>
            );
          })}
          <tr>
            <td className={`${cell} font-medium`}>Total</td>
            <td className={`${cell} font-mono font-medium`}>{plural(sum.credits, "credit")}</td>
            <td className={`${cell} font-mono`}>{dash(sum.pulls)}</td>
            <td className={cell} />
            <td className={cell} />
            <td className={`${cell} font-mono`}>{dash(sum.checks)}</td>
            <td className={`${cell} font-mono`}>{dash(sum.scans)}</td>
            <td className={`${cell} font-mono`}>{formatBytes(sum.storage)}</td>
            <td className={`${cell} font-mono`}>
              {sum.posts} · {sum.ideas} · {sum.cards}
            </td>
            <td className={`${cell} font-mono`}>{dash(sum.groq)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** M20 (phones and tablets): one row per client: credits + bar, a muted line, a mono line. */
function ClientList({ rows, top, sum, seriesOf, setActive }: RowsProps) {
  const navigate = useNavigate();
  return (
    <div className="xl:hidden">
      <p className="mb-2 font-mono text-label text-muted uppercase">
        Total {plural(sum.credits, "credit")} · {plural(sum.pulls, "pull")} ·{" "}
        {formatBytes(sum.storage)}
      </p>
      <ul>
        {rows.map((c) => (
          <li key={c.id} className="border-t border-line first:border-t-0">
            <button
              type="button"
              onClick={() => navigate(clientPath(c.slug, "/overview"))}
              onFocus={() => setActive(seriesOf(c.id))}
              onBlur={() => setActive(null)}
              className={`flex w-full flex-col gap-1.5 py-3 text-left ${c.archived_at ? "opacity-50" : ""}`}
            >
              <span className="flex items-center gap-3">
                <ClientMark client={c} />
                <span className="min-w-0 flex-1 truncate text-body-sm">{c.name}</span>
                <Tag c={c} />
                <span className="font-mono text-small">{plural(c.credits, "credit")}</span>
              </span>
              <Bar value={c.credits} top={top} />
              <span className="text-small text-muted">
                {c.is_demo
                  ? "Pulls off"
                  : `${plural(c.pulls, "pull")} · last ${c.last_pull ? lastPullLabel(c.last_pull, new Date(), { short: true }).toLowerCase() : "none"}${avgPerPull(c) ? ` · avg ${avgPerPull(c)}` : ""}`}
                {c.check_credits ? ` · checks ${c.check_credits}` : ""}
                {c.scan_credits ? ` · scans ${c.scan_credits}` : ""}
              </span>
              <span className="font-mono text-label text-muted">
                {c.storage_bytes ? formatBytes(c.storage_bytes) : "0 MB"} · {c.posts} posts ·{" "}
                {c.ideas} ideas · {c.cards} cards
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 17 / M20 Firecrawl credits by week: stacked bars (one segment per series), neutral shades. Hover or tap
 * a segment (or a legend item, or a table row) → that client stays solid, the others fade, tooltip above.
 * Arrow keys move between weeks. Plain HTML / CSS bars, no chart library.
 */
function WeeklyChart({
  weeksShown,
  series,
  rows,
  active,
  setActive,
}: {
  weeksShown: string[];
  series: Series[];
  rows: Parameters<typeof weekBars>[2];
  active: string | null;
  setActive: (k: string | null) => void;
}) {
  const bars = weekBars(weeksShown, series, rows);
  const max = axisMax(bars);
  const phoneLabels = shortWeekLabels(weeksShown);
  const [focusWeek, setFocusWeek] = useState<string | null>(null);
  const [tip, setTip] = useState<{ key: string; week: string } | null>(null);
  const shown = tip ?? (focusWeek && active ? { key: active, week: focusWeek } : null);
  const tipText = shown
    ? tooltipLines(
        series.find((s) => s.key === shown.key)!,
        shown.week,
        rows,
      )
    : null;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null || next < 0 || next >= bars.length) return;
    e.preventDefault();
    (e.currentTarget.parentElement?.children[next] as HTMLElement | null)?.focus();
  };

  return (
    <Card
      title="Firecrawl credits by week"
      action={<span className="text-small text-muted">Last 8 weeks</span>}
    >
      {series.length > 0 ? (
        <ul aria-label="Legend" className="mb-4 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onPointerEnter={() => setActive(s.key)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(s.key)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(active === s.key ? null : s.key)}
                className={`inline-flex min-h-11 items-center gap-1.5 text-small md:min-h-7 ${active === s.key ? "font-medium text-ink" : "text-muted"}`}
              >
                <span aria-hidden="true" className={`size-2.5 rounded-[2px] ${SHADE[s.shade]}`} />
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-body-sm text-muted">No credits spent in the last 8 weeks.</p>
      )}
      {/* Phones: edge to edge inside the card, so each of the 8 week columns is ≥ 44 px wide. */}
      <div className="relative -mx-4 md:mx-0">
        {tipText && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-control bg-ink px-3 py-2 text-small whitespace-nowrap text-white shadow-lg"
          >
            <p className="font-medium">{tipText.title}</p>
            <p className="font-mono text-label text-white/80">{tipText.detail}</p>
          </div>
        )}
        <div className="flex h-56 items-end border-b border-line">
          {bars.map((b, i) => (
            // The whole column is the button (≥ 44 px wide even with 8 weeks on a phone); the bar sits inside.
            <button
              key={b.week}
              type="button"
              aria-label={`Week of ${formatShortDate(b.week)}: ${plural(b.total, "credit")}${b.parts
                .filter((p) => p.credits)
                .map((p) => `, ${series.find((s) => s.key === p.key)?.name} ${p.credits}`)
                .join("")}`}
              onFocus={() => setFocusWeek(b.week)}
              onBlur={() => setFocusWeek(null)}
              onKeyDown={(e) => onKey(e, i)}
              className="flex h-full min-w-0 flex-1 flex-col justify-end px-[3px] outline-offset-2 md:px-1.5"
            >
              <span
                className="flex w-full flex-col-reverse overflow-hidden rounded-t-[3px]"
                style={{ height: `${(b.total / max) * 100}%` }}
              >
                {b.parts.map((p) => {
                  const s = series.find((x) => x.key === p.key)!;
                  if (!p.credits) return null;
                  return (
                    <span
                      key={p.key}
                      data-series={p.key}
                      onPointerEnter={() => {
                        setActive(p.key);
                        setTip({ key: p.key, week: b.week });
                      }}
                      onPointerLeave={() => {
                        setActive(null);
                        setTip(null);
                      }}
                      onClick={() =>
                        setTip((t) =>
                          t?.key === p.key && t.week === b.week
                            ? null
                            : { key: p.key, week: b.week },
                        )
                      }
                      className={`block w-full transition-opacity first:rounded-b-none last:rounded-t-[3px] ${SHADE[s.shade]} ${active && active !== p.key ? "opacity-30" : ""}`}
                      style={{ height: `${(p.credits / b.total) * 100}%` }}
                    />
                  );
                })}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex">
          {bars.map((b, i) => (
            <span
              key={b.week}
              className="min-w-0 flex-1 truncate px-[3px] text-center font-mono text-label text-muted md:px-1.5"
            >
              <span className="md:hidden">{phoneLabels[i]}</span>
              <span className="hidden md:inline">{formatShortDate(b.week)}</span>
            </span>
          ))}
        </div>
        <p className="mt-1 px-4 text-right font-mono text-label text-muted md:px-0">
          max {max} credits / week
        </p>
      </div>
    </Card>
  );
}
