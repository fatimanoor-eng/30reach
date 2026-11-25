import {
  Calendar,
  LayoutGrid,
  Lightbulb,
  SlidersVertical,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  XIcon,
} from "../components/icons/BrandIcons";
import type { Platform } from "../lib/platforms";

type IconComponent = LucideIcon | ComponentType<{ size?: number | string; className?: string }>;

export type NavItem = {
  to: string;
  label: string;
  icon: IconComponent;
  /** Platform pages are shown only when a competitor has an account there (Slice 16b). */
  platform?: Platform;
};

/** Sidebar + icon rail (Figma 6897:126). One list for both layouts. */
export const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "Research",
    items: [
      { to: "/overview", label: "Overview", icon: LayoutGrid },
      { to: "/instagram", label: "Instagram", icon: InstagramIcon, platform: "instagram" },
      { to: "/tiktok", label: "TikTok", icon: TikTokIcon, platform: "tiktok" },
      { to: "/linkedin", label: "LinkedIn", icon: LinkedInIcon, platform: "linkedin" },
      { to: "/facebook", label: "Facebook", icon: FacebookIcon, platform: "facebook" },
      { to: "/x", label: "X", icon: XIcon, platform: "x" },
      { to: "/competitors", label: "Competitors", icon: Users },
    ],
  },
  {
    label: "Plan",
    items: [
      { to: "/calendar", label: "Calendar", icon: Calendar },
      { to: "/ideas", label: "Idea board", icon: Lightbulb },
    ],
  },
];

/** Mobile bottom tabs (Figma M02). `match` = routes that light the tab up. */
export const mobileTabs: (NavItem & { match: string[] })[] = [
  { to: "/overview", label: "Overview", icon: LayoutGrid, match: ["/overview"] },
  {
    to: "/instagram",
    label: "Social",
    icon: InstagramIcon,
    match: ["/instagram", "/tiktok", "/linkedin", "/facebook", "/x"],
  },
  { to: "/calendar", label: "Calendar", icon: Calendar, match: ["/calendar"] },
  { to: "/ideas", label: "Ideas", icon: Lightbulb, match: ["/ideas"] },
  {
    to: "/more",
    label: "More",
    icon: SlidersVertical,
    match: ["/more", "/competitors", "/settings"],
  },
];

export function isActive(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Sidebar / rail sections with platform pages nobody has an account on left out (Slice 16b). */
export function visibleNavSections(visible: readonly Platform[]) {
  return navSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.platform || visible.includes(item.platform)),
  }));
}

/** The mobile Social tab opens the first platform someone has an account on (Instagram if none). */
export function socialTabTarget(visible: readonly Platform[]): string {
  return `/${visible[0] ?? "instagram"}`;
}

/** "/facebook" → "facebook"; anything else → undefined. */
export function platformOfPath(pathname: string): Platform | undefined {
  const first = pathname.split("/")[1];
  return navSections[0].items.find((i) => i.platform && i.to === `/${first}`)?.platform;
}
