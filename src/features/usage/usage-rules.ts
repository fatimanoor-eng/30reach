// Slice 17f: Usage page (Figma 17 / M20). Pure rules for the per-client table and the weekly chart, from
// usage_overview() (supabase/migrations/*_usage_overview.sql). Tested in usage-rules.test.ts.
import { formatShortDate, plural } from "../../lib/format";

export type UsageClient = {
  id: string;
  slug: string;
  name: string;
  initials: string | null;
  brand_color: string | null;
  is_demo: boolean;
  archived_at: string | null;
  credits: number;
  pull_credits: number;
  check_credits: number;
  scan_credits: number;
  groq_requests: number;
  pulls: number;
  last_pull: string | null;
  storage_bytes: number;
  posts: number;
  ideas: number;
  cards: number;
};
export type UsageWeekRow = {
  week: string; // Monday, YYYY-MM-DD (US Eastern)
  client_id: string | null;
  kind: "pull" | "handle_check" | "scan" | "competitor_search";
  credits: number;
  pulls: number;
};
export type UsageOverview = { clients: UsageClient[]; weeks: UsageWeekRow[]; unassigned: number };

export const WEEKS = 8;

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday (YYYY-MM-DD) of the week `date` falls in (calendar days, no time zone surprises). */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return iso(new Date(d.getTime() - back * DAY));
}

/** The last 8 Mondays, oldest first, ending with this week's. */
export function lastWeeks(today: string, n = WEEKS): string[] {
  const last = new Date(`${mondayOf(today)}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) => iso(new Date(last - (n - 1 - i) * 7 * DAY)));
}

/**
 * Table order (17): active clients by credits this month (most first, then A–Z), the demo after them,
 * archived last (greyed).
 */
export function tableRows(clients: readonly UsageClient[]): UsageClient[] {
  const rank = (c: UsageClient) => (c.archived_at ? 2 : c.is_demo ? 1 : 0);
  return [...clients].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.credits - a.credits ||
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

export function totals(clients: readonly UsageClient[]) {
  const sum = (k: keyof UsageClient) => clients.reduce((s, c) => s + (Number(c[k]) || 0), 0);
  return {
    credits: sum("credits"),
    pulls: sum("pulls"),
    checks: sum("check_credits"),
    scans: sum("scan_credits"),
    storage: sum("storage_bytes"),
    posts: sum("posts"),
    ideas: sum("ideas"),
    cards: sum("cards"),
    groq: sum("groq_requests"),
  };
}

/**
 * Credits Firecrawl counted this month that 30reach didn't (spike scripts, calls outside the app), shown
 * as "Other: N credits" under the table when > 0. `used` = plan − remaining.
 */
export function otherCredits(used: number | null, counted: number): number {
  return used === null ? 0 : Math.max(0, used - counted);
}

/** Average credits per pull ("—" when no pull this month). */
export const avgPerPull = (c: Pick<UsageClient, "pull_credits" | "pulls">) =>
  c.pulls > 0 ? Math.round(c.pull_credits / c.pulls) : null;

export type Series = { key: string; name: string; ids: string[]; shade: 0 | 1 | 2 };
export type WeekBar = { week: string; total: number; parts: { key: string; credits: number }[] };

/**
 * Chart series (17): the two clients that spent most over the 8 weeks get their own shade; the rest share
 * "Demo + other" (3 shades max, neutral, never brand colours). Unassigned credits count as other.
 */
export function chartSeries(
  clients: readonly UsageClient[],
  weeks: readonly UsageWeekRow[],
): Series[] {
  const spent = new Map<string, number>();
  for (const w of weeks)
    if (w.client_id) spent.set(w.client_id, (spent.get(w.client_id) ?? 0) + w.credits);
  const top = clients
    .filter((c) => (spent.get(c.id) ?? 0) > 0)
    .sort((a, b) => (spent.get(b.id) ?? 0) - (spent.get(a.id) ?? 0))
    .slice(0, 2);
  const rest = clients.filter((c) => !top.includes(c)).map((c) => c.id);
  const anyRest =
    weeks.some((w) => !w.client_id || rest.includes(w.client_id)) &&
    weeks.some((w) => w.credits > 0);
  return [
    ...top.map((c, i) => ({ key: c.id, name: c.name, ids: [c.id], shade: i as 0 | 1 })),
    ...(anyRest ? [{ key: "other", name: "Demo + other", ids: rest, shade: 2 as const }] : []),
  ];
}

/** One stacked bar per week: each series' credits, in series order. */
export function weekBars(
  weeksShown: readonly string[],
  series: readonly Series[],
  rows: readonly UsageWeekRow[],
): WeekBar[] {
  const seriesOf = (id: string | null) =>
    series.find((s) => id !== null && s.ids.includes(id) && s.key !== "other")?.key ??
    (series.some((s) => s.key === "other") ? "other" : null);
  return weeksShown.map((week) => {
    const parts = series.map((s) => ({ key: s.key, credits: 0 }));
    for (const r of rows) {
      if (r.week !== week) continue;
      const key = seriesOf(r.client_id);
      const part = parts.find((p) => p.key === key);
      if (part) part.credits += r.credits;
    }
    return { week, total: parts.reduce((s, p) => s + p.credits, 0), parts };
  });
}

/** Rounded-up axis maximum: 10, 20, 40, 80, 160… (at least 10). */
export function axisMax(bars: readonly WeekBar[]): number {
  const top = Math.max(0, ...bars.map((b) => b.total));
  let m = 10;
  while (m < top) m *= 2;
  return m;
}

const KIND_LABEL: Record<UsageWeekRow["kind"], string> = {
  pull: "pull",
  handle_check: "checks",
  scan: "scan",
  competitor_search: "scan",
};

/**
 * Tooltip (17 / M20): "All The Best Co · week of 24 Nov" + "75 credits · 1 pull (64) + scan (11)".
 * Scans and competitor searches are one "scan"; pulls say how many.
 */
export function tooltipLines(
  series: Series,
  week: string,
  rows: readonly UsageWeekRow[],
): { title: string; detail: string } {
  const mine = rows.filter(
    (r) =>
      r.week === week &&
      (series.key === "other"
        ? !r.client_id || series.ids.includes(r.client_id)
        : series.ids.includes(r.client_id ?? "")),
  );
  const by = new Map<string, number>();
  let pulls = 0;
  for (const r of mine) {
    const label = KIND_LABEL[r.kind];
    by.set(label, (by.get(label) ?? 0) + r.credits);
    if (r.kind === "pull") pulls += r.pulls;
  }
  const total = [...by.values()].reduce((a, b) => a + b, 0);
  const parts = ["pull", "scan", "checks"]
    .filter((k) => by.get(k))
    .map((k) =>
      k === "pull" ? `${plural(pulls || 1, "pull")} (${by.get(k)})` : `${k} (${by.get(k)})`,
    );
  return {
    title: `${series.name} · week of ${formatShortDate(week) ?? week}`,
    detail: total ? `${plural(total, "credit")} · ${parts.join(" + ")}` : "No credits",
  };
}

/** "Running low" under 10% left (17 meters). */
export const runningLow = (left: number, limit: number) => limit > 0 && left / limit < 0.1;

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

/** "1–30 Nov" (17), or "15 Nov – 14 Dec" across months: the billing period up to the day before it resets. */
export function billingLabel(periodStart: string | null, resetsAt: string | null): string | null {
  if (!periodStart || !resetsAt) return null;
  const a = new Date(periodStart);
  const b = new Date(Date.parse(resetsAt) - DAY);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTH.format(b)}`
    : `${a.getUTCDate()} ${MONTH.format(a)} – ${b.getUTCDate()} ${MONTH.format(b)}`;
}

/** Phone week labels: "5 Oct", "12", "19", "26", "2 Nov"… (the month only when it changes). */
export function shortWeekLabels(weeks: readonly string[]): string[] {
  return weeks.map((w, i) => {
    const d = new Date(`${w}T00:00:00Z`);
    const changed = i === 0 || weeks[i - 1].slice(5, 7) !== w.slice(5, 7);
    return changed ? `${d.getUTCDate()} ${MONTH.format(d)}` : String(d.getUTCDate());
  });
}
