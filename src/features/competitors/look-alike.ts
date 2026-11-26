// "Does this handle look like this brand?" (Discovery 2.0, shelf item): a soft, never-blocking note when a
// handle or page doesn't resemble the brand's name or website (e.g. "Ro" → @zzfitness99). Code only: no AI,
// no credits. Tested in look-alike.test.ts.

/** Words that say nothing about which brand it is. */
const FILLER = new Set([
  "the",
  "official",
  "hq",
  "inc",
  "co",
  "company",
  "corp",
  "llc",
  "ltd",
  "shop",
  "store",
  "app",
  "us",
  "usa",
  "uk",
  "ca",
  "au",
  "global",
  "team",
  "real",
  "get",
  "try",
  "join",
  "hello",
  "hi",
]);
/** Country / market suffixes glued onto handles: hims_us, glossier.uk, ro.official. */
const SUFFIX = /(official|hq|usa|us|uk|ca|au|global|app|shop|store|inc)$/;

const allWords = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const words = (s: string) => allWords(s).filter((w) => !FILLER.has(w));

/** The part of a handle or page link that names the account: "@Hims_US" → "himsus"; a URL → its slug. */
export function handleCore(handleOrUrl: string): string {
  let h = handleOrUrl.trim();
  try {
    if (/^https?:\/\//i.test(h)) {
      const parts = new URL(h).pathname.split("/").filter(Boolean);
      h = (parts[0] === "company" || parts[0] === "channel" ? parts[1] : parts[0]) ?? "";
    }
  } catch {
    /* keep */
  }
  return h
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * True when the handle plausibly belongs to the brand: it contains the brand's name (or a long word of it),
 * its initials, or the website's name; or the brand's name contains the handle (short handles like "ro").
 */
export function looksLikeBrand(
  handleOrUrl: string,
  brand: { name: string; website?: string | null },
): boolean {
  const core = handleCore(handleOrUrl);
  if (!core) return true; // nothing to judge
  const stripped = core.replace(SUFFIX, "") || core;
  const nameWords = words(brand.name);
  const joined = nameWords.join("");
  // Initials with and without the filler words: "All The Best Co" → "atbc" and "ab".
  const initials = [allWords(brand.name), nameWords].map((ws) => ws.map((w) => w[0]).join(""));
  const stem = (brand.website ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[./]/)[0]
    .replace(/[^a-z0-9]/g, "");
  const has = (part: string) =>
    part.length >= 2 && (core.includes(part) || stripped.includes(part));
  if (joined && (has(joined) || (stripped.length >= 2 && joined.includes(stripped)))) return true;
  if (stem && (has(stem) || (stripped.length >= 3 && stem.includes(stripped)))) return true;
  if (nameWords.some((w) => w.length >= 4 && has(w))) return true;
  if (initials.some((i) => i.length >= 2 && (stripped === i || core.startsWith(i)))) return true;
  return false;
}

/** The note under a field: "This doesn't look like Ro's account. Save anyway?" — or null when it does. */
export function lookAlikeNote(
  handleOrUrl: string,
  brand: { name: string; website?: string | null },
): string | null {
  if (!handleOrUrl.trim() || !brand.name.trim() || looksLikeBrand(handleOrUrl, brand)) return null;
  return `This doesn’t look like ${brand.name.trim()}’s account. Save anyway?`;
}
