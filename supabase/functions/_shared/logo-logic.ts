// Competitor logos (Discovery 2.0, 25 Nov 2026): which image to try, and whether it suits a small square
// mark. Pure (tested in logo-logic.test.ts); logo-image.ts does the fetching and resizing.
//
// Fallback chain: the site's logo if it's roughly square → the site icon (favicon / touch icon) → the
// Instagram / TikTok profile picture (pull-task) → initials. Wide wordmarks are unreadable at 32 px, and
// the 24 Nov spike sites' logos were all wide (702×45, 38 px tall), while their favicons were square.

/** Stored size: 128 × 128 PNG (rule 8: small and compressed; a 32–40 px avatar at 3× is sharp). */
export const LOGO_PX = 128;
/** Widest a logo can be (width ÷ height, either way) and still read as a square mark. */
export const MAX_LOGO_ASPECT = 1.5;
/** Smallest icon worth keeping (a 16 px favicon blown up to 128 is mush). */
export const MIN_ICON_PX = 48;
/** Never download more than this for a logo. */
export const MAX_LOGO_BYTES = 2_000_000;

export type LogoCandidate = { url: string; kind: "logo" | "icon" };

const s = (v: unknown) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : null);

/**
 * Shopify CDN images take their size from the URL (`?width=32&height=32`): ask for 256 px instead, so a
 * favicon isn't blurry. Other URLs are left alone.
 */
export function sizedUrl(url: string, px = 256): string {
  try {
    const u = new URL(url);
    if (!u.pathname.includes("/cdn/shop/")) return url;
    for (const k of ["width", "height"])
      if (u.searchParams.has(k)) u.searchParams.set(k, String(px));
    return u.toString();
  } catch {
    return url;
  }
}

/** Firecrawl's `branding` + page metadata → images to try, best first, no duplicates. */
export function logoCandidates(
  branding: Record<string, unknown> | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): LogoCandidate[] {
  const images = (branding?.images ?? {}) as Record<string, unknown>;
  const raw: [unknown, LogoCandidate["kind"]][] = [
    [branding?.logo, "logo"],
    [images.logo, "logo"],
    [images.appleTouchIcon, "icon"],
    [images.favicon, "icon"],
    [metadata?.favicon, "icon"],
  ];
  const out: LogoCandidate[] = [];
  for (const [v, kind] of raw) {
    const url = s(v);
    if (!url || /\.svg(\?|$)/i.test(url)) continue; // SVG can't be resized here
    const sized = sizedUrl(url);
    if (!out.some((c) => c.url === sized)) out.push({ url: sized, kind });
  }
  return out;
}

/** Does an image of this size make a good square mark? */
export function fitsSquare(width: number, height: number, kind: LogoCandidate["kind"]): boolean {
  if (width <= 0 || height <= 0) return false;
  const aspect = Math.max(width, height) / Math.min(width, height);
  if (kind === "logo") return aspect <= MAX_LOGO_ASPECT && Math.min(width, height) >= MIN_ICON_PX;
  return aspect <= 1.2 && Math.min(width, height) >= MIN_ICON_PX;
}
