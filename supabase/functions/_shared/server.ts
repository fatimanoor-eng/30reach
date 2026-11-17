// Shared Edge Function helpers (Deno). Auth model = the `credits` function:
// verify_jwt = true (config.toml) + withSupabase({ auth: "user" }) + is_team() called as the caller.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  type CreditsMeter,
  FIRECRAWL_CREDIT_USAGE_URL,
  parseCreditUsage,
} from "../credits/logic.ts";
import type { Platform } from "./pull-logic.ts";

export { withSupabase } from "npm:@supabase/server@1.9.2";
export type { SupabaseClient };

export const json = (body: unknown, status = 200) => Response.json(body, { status });

type RpcClient = { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> };

/** 403 unless the caller is a team member (same rule as RLS). */
export async function requireTeam(ctx: { supabase: RpcClient }): Promise<Response | null> {
  const { data, error } = await ctx.supabase.rpc("is_team");
  return error || data !== true ? json({ error: "not_team" }, 403) : null;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function firecrawlKey(): string {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  return key;
}

/** Live Firecrawl balance (0 credits). Null if Firecrawl can't be reached. Never logs the key. */
export async function fetchCreditUsage(): Promise<CreditsMeter | null> {
  try {
    const res = await fetch(FIRECRAWL_CREDIT_USAGE_URL, {
      headers: { Authorization: `Bearer ${firecrawlKey()}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`credit-usage: HTTP ${res.status}`);
      return null;
    }
    return parseCreditUsage(await res.json());
  } catch (err) {
    console.error(`credit-usage failed (${(err as Error).name})`);
    return null;
  }
}

/** Same cache the `credits` function reads (usage_meters['firecrawl']). */
export async function saveCreditsCache(admin: SupabaseClient, meter: CreditsMeter) {
  const { error } = await admin
    .from("usage_meters")
    .upsert({ key: "firecrawl", value: meter, updated_at: new Date().toISOString() });
  if (error) console.error(`usage_meters write failed (${error.code ?? "unknown"})`);
}

export class FirecrawlHttpError extends Error {
  constructor(public status: number) {
    super(`Firecrawl HTTP ${status}`);
  }
}

/**
 * ONE page of posts for one handle via Firecrawl → ScrapeCreators (2 credits; 0 if not found).
 * Request shapes from the Slice 1 spike (INTEGRATIONS.md §2a).
 */
export async function scrapePage(platform: Platform, handle: string, cursor: string | null) {
  const options =
    platform === "instagram"
      ? { handle, ...(cursor ? { next_max_id: cursor } : {}) }
      : { handle, sort_by: "latest", region: "US", ...(cursor ? { max_cursor: cursor } : {}) };
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${firecrawlKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      alexandria: {
        provider: "scrapecreators", // the only provider 30reach uses
        capability: platform === "instagram" ? "instagram/user-posts" : "tiktok/user-videos",
        options,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new FirecrawlHttpError(res.status);
  return (await res.json()) as unknown;
}
