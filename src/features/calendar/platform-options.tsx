import { PLATFORM_ICON, PLATFORMS } from "../../lib/platforms";
import { FORMATS, formatName, PLATFORM_LABEL, type CardPlatform } from "./calendar-ui";
import type { ChipOption } from "./SelectChip";

/** Platform select chip options (09 card header, 14d Plan it). */
export const PLATFORM_OPTIONS: ChipOption<CardPlatform>[] = PLATFORMS.map((p) => {
  const Icon = PLATFORM_ICON[p];
  return { value: p, label: PLATFORM_LABEL[p], icon: <Icon size={15} aria-hidden="true" /> };
});

/** Format options for a platform (none until a platform is picked). */
export const formatOptions = (platform: CardPlatform | null): ChipOption<string>[] =>
  (platform ? FORMATS[platform] : []).map((f) => ({ value: f, label: formatName(platform, f) }));

/** Keeps a format only if the platform has it ("reel" isn't a TikTok format). */
export const formatFor = (platform: CardPlatform | null, format: string | null | undefined) =>
  platform && format && FORMATS[platform].includes(format) ? format : null;
