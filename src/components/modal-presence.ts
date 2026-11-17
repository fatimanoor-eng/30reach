import { createContext } from "react";

/**
 * Set by <ModalPresence>: lets a modal that the page renders conditionally stay mounted while it plays
 * its exit animation. `open` is ANDed with the modal's own `open`; `onExited` runs once it has closed.
 */
export type ModalPresenceValue = { open: boolean; onExited: () => void };
export const ModalPresenceContext = createContext<ModalPresenceValue | null>(null);
