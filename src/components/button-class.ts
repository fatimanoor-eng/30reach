export type ButtonVariant = "primary" | "secondary" | "accent" | "danger" | "text";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-sidebar-2",
  secondary: "bg-surface text-ink border border-line hover:bg-soft",
  accent: "bg-flash text-ink hover:brightness-95",
  danger: "bg-spark text-white hover:brightness-95",
  text: "text-muted hover:text-ink",
};

/**
 * The Button look (DESIGN_SYSTEM › Components): min 44 px tall on mobile, 40 px from tablet up. Also for
 * a router <Link> that should look like a button (e.g. "+ Add client" on Pick a client).
 */
export function buttonClass(variant: ButtonVariant = "primary", className = "") {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-body-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:min-h-10 ${variants[variant]} ${className}`;
}
