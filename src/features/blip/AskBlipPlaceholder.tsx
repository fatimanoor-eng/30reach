import { BlipIdle } from "../../components/blip/BlipPoses";
import { ResponsiveDialog } from "../../components/ResponsiveDialog";

/** Placeholder until Slice 11 (Ask Blip panel 12 / M11). Opened by the Ask Blip buttons and "/". */
export function AskBlipPlaceholder({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      illustration={<BlipIdle />}
      title="Ask Blip"
      description="Ask Blip arrives in Slice 11. It will answer questions about the saved pull and cite the posts it used."
      primary={{ label: "Close", onClick: onClose }}
      cancelLabel={null}
    />
  );
}
