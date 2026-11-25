/** Display formatting shared across the app: counts, short dates, credit ratios. */

const numberFormat = new Intl.NumberFormat("en-US");

/** 1234 → "1,234" */
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

/** plural(1, "like") → "1 like"; plural(1021, "credit") → "1,021 credits"; custom plural form optional. */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(n)} ${Math.abs(n) === 1 ? singular : pluralForm}`;
}

// Fixed English month names: Intl "en-GB" now writes "Sept", the design uses "Sep"-style 3 letters.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Short date from the design: "17 Nov". Adds the year only when it isn't this year: "28 Dec 2025".
 * Local time. Returns null for missing/invalid input.
 */
export function formatShortDate(
  input: string | number | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (input === null || input === undefined || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/**
 * Share of the plan that is left, for meter bars: always 0–1.
 * Firecrawl can report MORE credits than the plan (e.g. 1,021 of 1,000 — coupon/bonus credits aren't in
 * planCredits), so the bar caps at full while the real number is shown as text.
 */
export function creditsFraction(remaining: number, plan: number): number {
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  if (!Number.isFinite(plan) || plan <= 0) return 1;
  return Math.min(1, remaining / plan);
}

/**
 * Firecrawl's plan total, when it means something. Firecrawl's `planCredits` is the monthly allowance only:
 * an account with extra credits can have more left than that (5,000 left, plan 1,000). Then — or when it's
 * missing — there's no honest total, and the app says just "5,000 left".
 */
export function creditsTotal(remaining: number, plan: number | null | undefined): number | null {
  return typeof plan === "number" && Number.isFinite(plan) && plan > 0 && plan >= remaining
    ? plan
    : null;
}

/** "919 of 1,000", or "5,000" when there's no honest total (dialogs: "Credits left this month"). */
export function creditsOf(remaining: number, plan: number | null | undefined): string {
  const total = creditsTotal(remaining, plan);
  return total === null
    ? formatNumber(remaining)
    : `${formatNumber(remaining)} of ${formatNumber(total)}`;
}

/** Compact counts for stats: 640 → "640", 3,100 → "3.1K", 18,400 → "18.4K", 212,000 → "212K", 1.25M → "1.3M". */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const unit = (div: number, suffix: string) => {
    const v = n / div;
    const text =
      Math.abs(v) >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString();
    return `${text}${suffix}`;
  };
  if (abs >= 1_000_000) return unit(1_000_000, "M");
  if (abs >= 1_000) return unit(1_000, "K");
  return formatNumber(Math.round(n));
}

const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "16:20" (local time). */
export function formatClock(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? "" : clock.format(d);
}
