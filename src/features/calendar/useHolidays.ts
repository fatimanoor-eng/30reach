import { useQueries } from "@tanstack/react-query";
import { callFunction } from "../../lib/pulls/api";
import { supabase } from "../../lib/supabase";
import type { HolidayRow } from "./events";

const COUNTRY = "US";
/** Same as CACHE_MAX_AGE_DAYS in supabase/functions/holidays/logic.ts. */
const MAX_AGE_MS = 90 * 86_400_000;

/**
 * One year of US holidays. `holiday_cache` is read-only for the team, so: read the cache; only when
 * the year is missing or older than 90 days, ask the `holidays` Edge Function to fetch Nager.Date
 * and fill it. If that fails but an older copy exists, use the older copy.
 */
async function loadYear(year: number): Promise<HolidayRow[]> {
  const { data: row, error } = await supabase
    .from("holiday_cache")
    .select("data, fetched_at")
    .eq("year", year)
    .eq("country", COUNTRY)
    .maybeSingle();
  if (error) throw error;
  const cached = row as { data: HolidayRow[]; fetched_at: string } | null;
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < MAX_AGE_MS) return cached.data;

  const res = await callFunction<{ data: HolidayRow[] }>("holidays", { year });
  if (res.ok && Array.isArray(res.data.data)) return res.data.data;
  if (cached) return cached.data;
  throw new Error(`holidays ${year}: ${res.status}`);
}

/** Holidays for each year a view needs. `byYear` has only the years that loaded. */
export function useHolidays(years: number[]) {
  const results = useQueries({
    queries: years.map((year) => ({
      queryKey: ["holidays", COUNTRY, year],
      queryFn: () => loadYear(year),
      staleTime: Infinity,
      retry: 1,
    })),
  });
  const byYear = new Map<number, HolidayRow[]>();
  results.forEach((r, i) => r.data && byYear.set(years[i], r.data));
  return {
    byYear,
    failedYears: years.filter((_, i) => results[i].isError),
    retry: () => results.forEach((r) => r.isError && void r.refetch()),
  };
}
