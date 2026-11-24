import { createContext, useContext } from "react";
import { isShownPlatform, type ShownPlatform } from "../../lib/platforms";
import type { OverviewPost } from "../overview/metrics";

/** A post the idea board can hold: not Facebook until ideas know Facebook (Slice 16c). */
export type IdeaReadyPost = OverviewPost & { platform: ShownPlatform };
export const isSaveable = (p: OverviewPost): p is IdeaReadyPost => isShownPlatform(p.platform);

/** What the 06d dialog needs: the post, its brand's name and its thumbnail (signed URL), if any. */
export type SaveablePost = { post: IdeaReadyPost; brandName: string; thumbUrl?: string };

export const SaveAsIdeaContext = createContext<((p: SaveablePost) => void) | null>(null);

/** "Save as idea" on any post (Overview, Instagram, TikTok, LinkedIn): opens the 06d dialog / M10 sheet. */
export function useSaveAsIdea(): (p: SaveablePost) => void {
  const open = useContext(SaveAsIdeaContext);
  if (!open) throw new Error("useSaveAsIdea must be used inside <SaveAsIdeaProvider>");
  return open;
}
