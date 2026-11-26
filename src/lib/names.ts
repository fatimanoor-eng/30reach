// Short names and aliases (27 Nov 2026). Mirrors supabase/functions/_shared/names.ts (tested in
// names.test.ts). Short names show where space is tight: chips, tables, charts, the pull dialog.

export const SHORT_MAX = 24;
export const ALIASES_MAX = 8;

/** The name to show where space is tight ("ABCU" for "Acme Business & Commerce University"). */
export const displayName = (b: { name: string; short_name?: string | null }) =>
  b.short_name?.trim() || b.name;

/** "ACU, ABC Uni" → ["ACU", "ABC Uni"]: trimmed, distinct, never the name or short name, at most 8. */
export function parseAliases(text: string, name = "", shortName = ""): string[] {
  const taken = new Set([name, shortName].map((n) => n.trim().toLowerCase()).filter(Boolean));
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const a = raw.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!a || taken.has(a.toLowerCase())) continue;
    taken.add(a.toLowerCase());
    out.push(a);
    if (out.length === ALIASES_MAX) break;
  }
  return out;
}

export const aliasesText = (aliases: readonly string[] | null | undefined) =>
  (aliases ?? []).join(", ");

/** The short name to save: trimmed, null when empty or the same as the name. */
export function shortNameValue(text: string, name: string): string | null {
  const s = text.replace(/\s+/g, " ").trim().slice(0, SHORT_MAX);
  return s && s.toLowerCase() !== name.trim().toLowerCase() ? s : null;
}
