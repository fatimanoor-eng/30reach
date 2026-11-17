import { type ReactNode, useMemo, useState } from "react";
import { ModalPresenceContext } from "./modal-presence";

/**
 * Keeps its children mounted after `open` turns false, until the modal inside (Drawer, BottomSheet,
 * Dialog via useNativeModal) has played its exit animation — then unmounts them.
 *
 *   <ModalPresence open={panelOpen}><CompetitorPanel open … /></ModalPresence>
 *
 * Without it, `{open && <Drawer open />}` would vanish instantly with no slide-out.
 */
export function ModalPresence({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  // Opening again (also mid-exit) mounts / keeps it. Derived during render, React's documented pattern.
  if (open && !mounted) setMounted(true);
  const value = useMemo(() => ({ open, onExited: () => setMounted(false) }), [open]);
  if (!mounted) return null;
  return <ModalPresenceContext value={value}>{children}</ModalPresenceContext>;
}
