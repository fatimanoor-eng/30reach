import { PLATFORM_ICON, PLATFORMS, type Platform } from "../../lib/platforms";
import { useTrackedPlatforms } from "../../lib/useClientPlatforms";
import { FORMATS, formatName, PLATFORM_LABEL, type CardPlatform } from "./calendar-ui";
import type { ChipOption } from "./SelectChip";

/** Platform select chip options (09 card header, 14d Plan it). */
export const PLATFORM_OPTIONS: ChipOption<CardPlatform>[] = PLATFORMS.map((p) => {
  const Icon = PLATFORM_ICON[p];
  return { value: p, label: PLATFORM_LABEL[p], icon: <Icon size={15} aria-hidden="true" /> };
});

/**
 * The current client's platforms (Slice 17g fix): `client_platforms` on + supported, in the usual order.
 * Every platform while that loads (or if it fails), so nothing flickers away.
 */
export function useClientPlatforms(): Platform[] {
  return useTrackedPlatforms() ?? PLATFORMS;
}

/**
 * Platform chip options for this client. `keep` = the card's / idea's own platform: shown even when the
 * client no longer tracks it, so an older card never loses its value.
 */
export function useClientPlatformOptions(keep?: CardPlatform | null): ChipOption<CardPlatform>[] {
  const tracked = useClientPlatforms();
  return PLATFORM_OPTIONS.filter((o) => tracked.includes(o.value) || o.value === keep);
}

/** Format options for a platform (none until a platform is picked). */
export const formatOptions = (platform: CardPlatform | null): ChipOption<string>[] =>
  (platform ? FORMATS[platform] : []).map((f) => ({ value: f, label: formatName(platform, f) }));

/** Keeps a format only if the platform has it ("reel" isn't a TikTok format). */
export const formatFor = (platform: CardPlatform | null, format: string | null | undefined) =>
  platform && format && FORMATS[platform].includes(format) ? format : null;
