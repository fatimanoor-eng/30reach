import { useLogoUrl } from "../features/clients/clients-api";
import { Avatar } from "./Avatar";

type Props = Omit<Parameters<typeof Avatar>[0], "src"> & { logoPath?: string | null };

/**
 * A competitor's avatar (Discovery 2.0): its square logo when it has one (signed URL, cached for the hour),
 * else its initials. Same sizes and tones as Avatar. No logo → no request.
 */
export function BrandAvatar({ logoPath, ...rest }: Props) {
  return logoPath ? <LogoAvatar logoPath={logoPath} {...rest} /> : <Avatar {...rest} />;
}

function LogoAvatar({ logoPath, ...rest }: Props) {
  const url = useLogoUrl(logoPath).data;
  return <Avatar src={url} {...rest} />;
}
