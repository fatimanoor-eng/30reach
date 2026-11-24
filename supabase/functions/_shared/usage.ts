// Usage events (Slice 17a): what each client costs in Firecrawl credits and Groq tokens. Pure, tested in
// usage.test.ts; written by server.ts › recordUsage (service role). Table: public.usage_events.

export type UsageKind = "pull" | "handle_check" | "scan" | "competitor_search" | "groq";
export type UsageProvider = "firecrawl" | "groq";

export type UsageInput = {
  kind: UsageKind;
  clientId?: string | null;
  clientName?: string | null;
  credits?: number | null;
  tokens?: number | null;
  requests?: number | null;
  fn?: string | null;
  refId?: string | null;
  actor?: string | null;
};

export type UsageRow = {
  client_id: string | null;
  client_name: string | null;
  kind: UsageKind;
  provider: UsageProvider;
  credits: number;
  tokens: number;
  requests: number;
  fn: string | null;
  ref_id: string | null;
  actor: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const count = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
const uuid = (v: string | null | undefined) => (v && UUID.test(v) ? v : null);

/**
 * One usage event → a row, or null when there's nothing to record (a Firecrawl call that cost 0 credits,
 * e.g. a handle that doesn't exist; a Groq call with no tokens). Bad ids are dropped, not stored.
 */
export function usageRow(e: UsageInput): UsageRow | null {
  const provider: UsageProvider = e.kind === "groq" ? "groq" : "firecrawl";
  const credits = provider === "firecrawl" ? count(e.credits) : 0;
  const tokens = provider === "groq" ? count(e.tokens) : 0;
  if (provider === "firecrawl" && credits === 0) return null;
  if (provider === "groq" && tokens === 0) return null;
  return {
    client_id: uuid(e.clientId),
    client_name: e.clientName?.trim().slice(0, 120) || null,
    kind: e.kind,
    provider,
    credits,
    tokens,
    requests: e.requests == null ? 1 : count(e.requests),
    fn: e.fn?.slice(0, 40) || null,
    ref_id: uuid(e.refId),
    actor: uuid(e.actor),
  };
}

/** Total tokens from a Groq chat-completions body (`usage.total_tokens`), or 0. */
export function groqTokens(body: unknown): number {
  const usage = (body as { usage?: { total_tokens?: unknown } } | null)?.usage;
  return typeof usage?.total_tokens === "number" ? usage.total_tokens : 0;
}
