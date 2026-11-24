import { useLocation } from "react-router";
import { useVisiblePlatforms } from "../lib/useVisiblePlatforms";
import { mobileTabs, platformOfPath, socialTabTarget, visibleNavSections } from "./nav";

/** Sidebar / rail sections for the current client: platform pages only where a competitor has an account. */
export function useNavSections() {
  const { pathname } = useLocation();
  return visibleNavSections(useVisiblePlatforms(platformOfPath(pathname)));
}

/** Mobile bottom tabs; the Social tab opens the first platform someone has an account on. */
export function useMobileTabs() {
  const target = socialTabTarget(useVisiblePlatforms());
  return mobileTabs.map((tab) => (tab.label === "Social" ? { ...tab, to: target } : tab));
}
