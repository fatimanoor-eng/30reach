// Pure helpers for the `credits` Edge Function. No Deno APIs here, so Vitest can test them.

/** How long a cached Firecrawl reading is reused before calling Firecrawl again. */
export const CACHE_TTL_MS = 5 * 60 * 1000;

export const FIRECRAWL_CREDIT_USAGE_URL = "https://api.firecrawl.dev/v2/team/credit-usage";

/** What the app receives (and what is cached in usage_meters.value under key 'firecrawl'). */
export type CreditsMeter = {
  remaining: number;
  plan: number;
  periodStart: string | null;
  /** End of the billing period = when credits reset (Firecrawl's billingPeriodEnd). */
  resetsAt: string | null;
};

export type CreditsResponse = CreditsMeter & {
  /** When this reading was taken from Firecrawl. */
  updatedAt: string;
  /** true when Firecrawl couldn't be reached and this is an older cached reading. */
  stale: boolean;
};

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isDateString = (v: unknown): v is string =>
  typeof v === "string" && !Number.isNaN(Date.parse(v));

/**
 * Firecrawl GET /v2/team/credit-usage →
 *   { success: true, data: { remainingCredits, planCredits, billingPeriodStart, billingPeriodEnd } }
 * Returns null if the shape isn't what we expect (never guess numbers).
 */
export function parseCreditUsage(body: unknown): CreditsMeter | null {
  const data = (body as { data?: Record<string, unknown> } | null)?.data;
  if (!data || !isNumber(data.remainingCredits) || !isNumber(data.planCredits)) return null;
  return {
    remaining: data.remainingCredits,
    plan: data.planCredits,
    periodStart: isDateString(data.billingPeriodStart) ? data.billingPeriodStart : null,
    resetsAt: isDateString(data.billingPeriodEnd) ? data.billingPeriodEnd : null,
  };
}

/** Accepts a cached usage_meters.value only if it has the expected shape. */
export function parseCachedMeter(value: unknown): CreditsMeter | null {
  const v = value as Partial<CreditsMeter> | null;
  if (!v || !isNumber(v.remaining) || !isNumber(v.plan)) return null;
  return {
    remaining: v.remaining,
    plan: v.plan,
    periodStart: isDateString(v.periodStart) ? v.periodStart : null,
    resetsAt: isDateString(v.resetsAt) ? v.resetsAt : null,
  };
}

export function isFresh(updatedAt: string | null | undefined, now: number, ttl = CACHE_TTL_MS) {
  if (!updatedAt) return false;
  const t = Date.parse(updatedAt);
  return !Number.isNaN(t) && now - t >= 0 && now - t < ttl;
}
