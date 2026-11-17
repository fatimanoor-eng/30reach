import type { SVGProps } from "react";

/**
 * Instagram + TikTok line icons from Figma (Icon/instagram 6897:11, Icon/tiktok 6897:16).
 * Lucide no longer ships brand logos. Same API shape as Lucide icons: `size`, currentColor, 1.75 stroke.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "viewBox"> & { size?: number | string };

function base({ size = 24, className = "", ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: `icon ${className}`,
    ...props,
  };
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M16 3H8C5.23858 3 3 5.23858 3 8V16C3 18.7614 5.23858 21 8 21H16C18.7614 21 21 18.7614 21 16V8C21 5.23858 18.7614 3 16 3Z" />
      <path d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z" />
      <path d="M17.5 7.30001C17.9418 7.30001 18.2999 6.94184 18.2999 6.50001C18.2999 6.05818 17.9418 5.70001 17.5 5.70001C17.0581 5.70001 16.7 6.05818 16.7 6.50001C16.7 6.94184 17.0581 7.30001 17.5 7.30001Z" />
    </svg>
  );
}

export function TikTokIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 3V14.5C14 15.1922 13.7947 15.8689 13.4101 16.4445C13.0256 17.0201 12.4789 17.4687 11.8394 17.7336C11.1999 17.9985 10.4961 18.0678 9.81718 17.9327C9.13825 17.7977 8.51461 17.4644 8.02513 16.9749C7.53564 16.4854 7.2023 15.8618 7.06725 15.1828C6.9322 14.5039 7.00152 13.8001 7.26642 13.1606C7.53133 12.5211 7.97993 11.9744 8.55551 11.5899C9.13108 11.2053 9.80777 11 10.5 11" />
      <path d="M14 3C14.4 5.6 16.4 7.6 19 8" />
    </svg>
  );
}
