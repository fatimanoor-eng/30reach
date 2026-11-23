import { createContext, useContext } from "react";
import type { BlipPlatform } from "../../lib/platforms";
import type { OverviewPost } from "../overview/metrics";

/**
 * What the 06d dialog needs: the post, its brand's name and its thumbnail (signed URL), if any.
 * Instagram / TikTok posts only: ideas and calendar cards learn LinkedIn in Slice 15c.
 */
export type SaveablePost = {
  post: OverviewPost & { platform: BlipPlatform };
  brandName: string;
  thumbUrl?: string;
};

/** Can this post be saved as an idea yet? (LinkedIn: Slice 15c.) */
export const isSaveable = (p: OverviewPost): p is SaveablePost["post"] => p.platform !== "linkedin";

export const SaveAsIdeaContext = createContext<((p: SaveablePost) => void) | null>(null);

/** "Save as idea" on any post (Overview, Instagram, TikTok): opens the 06d dialog / M10 sheet. */
export function useSaveAsIdea(): (p: SaveablePost) => void {
  const open = useContext(SaveAsIdeaContext);
  if (!open) throw new Error("useSaveAsIdea must be used inside <SaveAsIdeaProvider>");
  return open;
}
