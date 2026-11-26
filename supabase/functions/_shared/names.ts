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

// ───────────────────────────────────────────── suggest-names (one Groq call per client, once)
export type NameItem = { name: string; website?: string | null };
export type NameSuggestion = { shortName: string; aliases: string[] };

export const NAMES_SCHEMA = {
  name: "short_names",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["i", "short_name", "aliases"],
          properties: {
            i: { type: "integer" },
            short_name: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
};

export function namesSystem(): string {
  return [
    "Facts: Breakthirty is the agency; 30reach is its tool; you are Blip. These are a client and the brands it competes with.",
    "For each numbered organisation give i, short_name and aliases.",
    "- short_name: what people usually call it in 1-2 words when the name is long (an acronym or the brand word, e.g. 'ABCU' for 'Acme Business & Commerce University'); '' if the name is already short or you're not sure.",
    "- aliases: other names people really use for the SAME organisation (acronyms, old names, common short forms); [] if none or unsure. Never another organisation, never a slogan.",
    "Answer in JSON only.",
  ].join("\n");
}

export const namesUser = (items: readonly NameItem[]) =>
  items
    .map(
      (it, i) =>
        `${i}. ${it.name}${it.website ? ` (${it.website.replace(/^https?:\/\//, "")})` : ""}`,
    )
    .join("\n");

/** Groq's answer → a suggestion per item index; empty ones and junk are dropped (code decides). */
export function validateNames(
  raw: unknown,
  items: readonly NameItem[],
): Map<number, NameSuggestion> | null {
  const list = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return null;
  const out = new Map<number, NameSuggestion>();
  for (const x of list as Record<string, unknown>[]) {
    const i = Number(x?.i);
    const item = items[i];
    if (!item || out.has(i)) continue;
    const shortName = cleanShortName(x.short_name, item.name);
    const aliases = cleanAliases(x.aliases, item.name, shortName);
    if (shortName || aliases.length) out.set(i, { shortName, aliases });
  }
  return out;
}
