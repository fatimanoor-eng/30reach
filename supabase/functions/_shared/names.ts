// Short names and aliases (27 Nov 2026). Pure, tested in names.test.ts; mirrored in src/lib/names.ts.

export const SHORT_MAX = 24;
export const ALIAS_MAX = 60;
export const ALIASES_MAX = 8;

const tidy = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, max) : "";

/** A suggested short name: ≤ 24 chars, not just the full name again; "" when there's nothing better. */
export function cleanShortName(raw: unknown, name: string): string {
  const s = tidy(raw, SHORT_MAX + 10);
  if (!s || s.length > SHORT_MAX) return "";
  return s.toLowerCase() === name.trim().toLowerCase() ? "" : s;
}

/** Aliases: trimmed, distinct (case-insensitive), never the name or short name, at most 8. */
export function cleanAliases(raw: unknown, name: string, shortName = ""): string[] {
  const taken = new Set([name, shortName].map((n) => n.trim().toLowerCase()).filter(Boolean));
  const out: string[] = [];
  for (const a of Array.isArray(raw) ? raw : []) {
    const t = tidy(a, ALIAS_MAX);
    if (!t || taken.has(t.toLowerCase())) continue;
    taken.add(t.toLowerCase());
    out.push(t);
    if (out.length === ALIASES_MAX) break;
  }
  return out;
}

/** The name to show where space is tight. */
export const displayName = (b: { name: string; short_name?: string | null }) =>
  b.short_name?.trim() || b.name;
