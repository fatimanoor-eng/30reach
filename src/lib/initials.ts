/**
 * What an avatar shows (polish round): at most 2 letters, all capitals ("WW", "LM", "HI", "HE"), so every
 * avatar looks the same and similar names stay apart (Hims "HI" vs Hers "HE"). Stored initials are
 * editable and mixed-case ("Hi", "Fo"); only the display changes. "All" (the All-brands pill) stays.
 */
export function avatarText(initials: string): string {
  const v = initials.trim();
  if (v === "All") return v;
  return [...v]
    .filter((ch) => /[\p{L}\p{N}]/u.test(ch))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
