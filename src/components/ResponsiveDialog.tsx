import { MQ_TABLET_UP, useMediaQuery } from "../lib/useMediaQuery";
import { BottomSheet } from "./BottomSheet";
import { Dialog } from "./Dialog";
import type { ModalProps } from "./modal-types";

/** Dialog from 768 px up, bottom sheet below (DESIGN_SYSTEM › Layout: "Dialogs → bottom sheets"). */
export function ResponsiveDialog(props: ModalProps) {
  const tabletUp = useMediaQuery(MQ_TABLET_UP);
  return tabletUp ? <Dialog {...props} /> : <BottomSheet {...props} />;
}
