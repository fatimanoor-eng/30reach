import {
  Calendar,
  LayoutGrid,
  Lightbulb,
  SlidersVertical,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { InstagramIcon, TikTokIcon } from "../components/icons/BrandIcons";

type IconComponent = LucideIcon | ComponentType<{ size?: number | string; className?: string }>;

export type NavItem = { to: string; label: string; icon: IconComponent };

/** Sidebar + icon rail (Figma 6897:126). One list for both layouts. */
export const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "Research",
    items: [
      { to: "/overview", label: "Overview", icon: LayoutGrid },
      { to: "/instagram", label: "Instagram", icon: InstagramIcon },
      { to: "/tiktok", label: "TikTok", icon: TikTokIcon },
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
  { to: "/instagram", label: "Social", icon: InstagramIcon, match: ["/instagram", "/tiktok"] },
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
