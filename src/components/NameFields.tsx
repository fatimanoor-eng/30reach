import { SHORT_MAX } from "../lib/names";
import { TextField } from "./TextField";

/**
 * "Short name" + "Also known as" (27 Nov 2026), under a Name field: Client settings, the competitor panel,
 * Add client Review. Short names show where space is tight; Blip treats every name as the same brand.
 */
export function NameFields({
  shortName,
  aliases,
  onShortName,
  onAliases,
  className = "",
}: {
  shortName: string;
  aliases: string;
  onShortName: (v: string) => void;
  onAliases: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`grid gap-4 md:grid-cols-2 ${className}`}>
      <TextField
        label="Short name"
        value={shortName}
        onChange={(e) => onShortName(e.target.value)}
        maxLength={SHORT_MAX}
        placeholder="e.g. ABCU"
        message="Shown where space is tight"
      />
      <TextField
        label="Also known as"
        value={aliases}
        onChange={(e) => onAliases(e.target.value)}
        maxLength={300}
        placeholder="e.g. ACU, ABC Uni"
        message="Other names, separated by commas"
      />
    </div>
  );
}
