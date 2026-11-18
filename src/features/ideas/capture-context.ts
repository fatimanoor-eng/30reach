import { createContext, useContext } from "react";

/** A capture that hasn't been saved yet (14a "Just pasted" card). Lives only in memory. */
export type Draft = {
  key: string;
  kind: "screenshot" | "link" | "note";
  /** Mono header: "JUST PASTED" (Figma 14a) for pastes, else "NEW SCREENSHOT" / "NEW LINK" / "NEW NOTE". */
  label: string;
  /** Screenshot: compressing → ready (or error). Link / note: always ready. */
  status: "compressing" | "ready" | "error";
  image?: Blob;
  /** Object URL of the compressed image, for the preview. */
  previewUrl?: string;
  error?: string;
  link: string;
  note: string;
  tags: string[];
};

export type CaptureApi = {
  drafts: Draft[];
  /** The draft that should take focus when it appears (the newest one). */
  focusKey: string | null;
  addImages: (files: File[], how: "paste" | "drop" | "pick") => void;
  addLink: (url?: string, pasted?: boolean) => void;
  addNote: (text?: string, pasted?: boolean) => void;
  update: (key: string, patch: Partial<Pick<Draft, "link" | "note" | "tags">>) => void;
  remove: (key: string) => void;
};

export const CaptureContext = createContext<CaptureApi | null>(null);

export function useCapture(): CaptureApi {
  const api = useContext(CaptureContext);
  if (!api) throw new Error("useCapture must be used inside <IdeaCaptureProvider>");
  return api;
}

/** At most this many unsaved drafts at once (a big drop is cut off with a toast). */
export const MAX_DRAFTS = 10;
