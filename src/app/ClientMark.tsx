import { useLogoUrl } from "../features/clients/clients-api";
import { type ClientSummary, clientInitials, markColors } from "../lib/client-path";

const sizes = {
  md: "size-8 rounded-[6px] text-small", // sidebar card, menu rows
  lg: "size-9 rounded-[7px] text-small", // phone sheet rows
} as const;

/**
 * Client mark (15a): initials on the brand colour, with ink or white text (whichever reads better).
 * No colour, or a black / white brand colour → initials on ink with a hairline (`dark` = the hairline
 * that shows on the black sidebar). With a logo (Slice 17c, private client-logos bucket): the logo on
 * white, initials while it loads or if it fails.
 */
export function ClientMark({
  client,
  size = "md",
  dark = false,
  className = "",
}: {
  client: Pick<ClientSummary, "name" | "initials" | "brand_color" | "logo_path">;
  size?: keyof typeof sizes;
  /** On the black sidebar / rail / app bar. */
  dark?: boolean;
  className?: string;
}) {
  const colors = markColors(client.brand_color);
  const base = `inline-flex shrink-0 items-center justify-center font-medium ${sizes[size]} ${className}`;
  const initials = clientInitials(client.name, client.initials);
  const logo = useLogoUrl(client.logo_path);
  if (logo.data) {
    return (
      <span
        aria-hidden="true"
        className={`${base} overflow-hidden border bg-white p-0.5 ${dark ? "border-sidebar-line" : "border-line"}`}
      >
        <img src={logo.data} alt="" className="size-full object-contain" />
      </span>
    );
  }
  if (colors.kind === "ink") {
    return (
      <span
        aria-hidden="true"
        className={`${base} border bg-ink text-white ${dark ? "border-sidebar-line" : "border-ink"}`}
      >
        {initials}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: colors.background }}
      className={`${base} ${colors.text === "ink" ? "text-ink" : "text-white"}`}
    >
      {initials}
    </span>
  );
}
