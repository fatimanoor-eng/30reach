import { avatarText } from "../lib/initials";

type AvatarTone = "brand" | "user" | "all" | "white" | "pop" | "blue" | "dark";
type AvatarSize = "sm" | "md" | "lg";

const tones: Record<AvatarTone, string> = {
  brand: "bg-soft text-ink",
  user: "bg-bloom text-ink",
  all: "bg-flash text-ink",
  white: "bg-white text-ink",
  pop: "bg-pop text-ink",
  blue: "bg-blue text-white",
  dark: "bg-sidebar-2 text-white",
};

const sizes: Record<AvatarSize, string> = {
  sm: "size-6 text-label font-semibold", // BDO, like the Figma pills; mono "All" is too wide at 11 px
  md: "size-8 text-small font-semibold",
  lg: "size-10 text-body-sm font-semibold",
};

/** Initials in a circle: brand pills, user (bloom), "All brands" (flash). */
export function Avatar({
  initials,
  tone = "brand",
  size = "sm",
  className = "",
}: {
  initials: string;
  tone?: AvatarTone;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${tones[tone]} ${sizes[size]} ${className}`}
    >
      {avatarText(initials)}
    </span>
  );
}
