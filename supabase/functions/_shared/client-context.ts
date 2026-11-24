// Slice 17e: what the AI functions know about the client they're working for. Pure (tested in
// client-context.test.ts); ai-server.ts › loadClientContext reads the row.
//
// The brief comes from the client's website (scan) and the team's edits, so prompts wrap it in <client>
// and say it's information, not instructions. Checks are decided here by code, never by the model, and
// mirror src/lib/client-rules.ts › checksFor.

export type CheckKind = "health" | "finance" | "age" | "kids";
export type Checks = Record<CheckKind, boolean>;
export const NO_CHECKS: Checks = { health: false, finance: false, age: false, kids: false };

export function checksFor(regulated: readonly string[], audienceIsKids: boolean): Checks {
  const has = (...topics: string[]) => topics.some((t) => regulated.includes(t));
  return {
    health: has("health", "medical claims", "weight loss", "pharma", "supplements"),
    finance: has("finance"),
    age: has("alcohol", "gambling", "cannabis", "tobacco"),
    kids: audienceIsKids,
  };
}
export const anyCheck = (c: Checks) => c.health || c.finance || c.age || c.kids;

export type ClientRow = {
  name: string;
  description?: string | null;
  industry?: string | null;
  audience?: string | null;
  country?: string | null;
  language?: string | null;
  regulated?: string[] | null;
  audience_is_kids?: boolean | null;
  content_rules?: unknown;
};

export type ClientContext = {
  name: string;
  /** "<client>…</client>" lines for the system prompt (≤ BRIEF_MAX characters inside). */
  brief: string;
  /** Industry only: light small talk doesn't need the rest. */
  industry: string;
  /** How many content rules the client has (the claims check also checks against them). */
  rules: number;
  checks: Checks;
};

export const BRIEF_MAX = 700;
const one = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, max) : "";

/** The client row → its prompt context. Unknown or empty fields are left out, never guessed. */
export function contextFromRow(row: ClientRow): ClientContext {
  const checks = checksFor(row.regulated ?? [], row.audience_is_kids === true);
  const rules = (Array.isArray(row.content_rules) ? row.content_rules : [])
    .map((r) => one((r as { rule?: unknown })?.rule, 140))
    .filter(Boolean)
    .slice(0, 5);
  const on = (Object.keys(checks) as CheckKind[]).filter((k) => checks[k]);
  const lines = [
    one(row.description, 220) && `What they do: ${one(row.description, 220)}`,
    one(row.industry, 60) && `Industry: ${one(row.industry, 60)}`,
    one(row.audience, 100) && `Audience: ${one(row.audience, 100)}`,
    row.country &&
      `Market: ${one(row.country, 2)}${row.language ? `, ${one(row.language, 2)}` : ""}`,
    rules.length > 0 && `Their content rules: ${rules.map((r) => `- ${r}`).join(" ")}`,
    on.length > 0 && `Content checks on: ${on.join(", ")}`,
  ].filter(Boolean) as string[];
  let inside = "";
  for (const l of lines) if (`${inside}${l}\n`.length <= BRIEF_MAX) inside += `${l}\n`;
  return {
    name: one(row.name, 80) || "the client",
    brief: inside ? `<client>\n${inside}</client>` : "",
    industry: one(row.industry, 60),
    rules: rules.length,
    checks,
  };
}
