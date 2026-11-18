import { createContext, useContext } from "react";

/**
 * Opens the Ask Blip panel from anywhere in the shell. With a question, Blip asks it straight away
 * (e.g. "Ask Blip what changed" on 05e).
 */
export const AskBlipContext = createContext<(question?: string) => void>(() => {});
export const useAskBlip = () => useContext(AskBlipContext);
