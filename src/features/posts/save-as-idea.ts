import { createContext, useContext } from "react";
import type { OverviewPost } from "../overview/metrics";

/** What the 06d dialog needs: the post, its brand's name and its thumbnail (signed URL), if any. */
export type SaveablePost = { post: OverviewPost; brandName: string; thumbUrl?: string };

export const SaveAsIdeaContext = createContext<((p: SaveablePost) => void) | null>(null);

/** "Save as idea" on any post (Overview, Instagram, TikTok, LinkedIn): opens the 06d dialog / M10 sheet. */
export function useSaveAsIdea(): (p: SaveablePost) => void {
  const open = useContext(SaveAsIdeaContext);
  if (!open) throw new Error("useSaveAsIdea must be used inside <SaveAsIdeaProvider>");
  return open;
}
