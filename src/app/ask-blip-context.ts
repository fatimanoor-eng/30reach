import { createContext, useContext } from "react";

/** Opens the Ask Blip panel from anywhere in the shell (e.g. "Ask Blip what changed" on 05e). */
export const AskBlipContext = createContext<() => void>(() => {});
export const useAskBlip = () => useContext(AskBlipContext);
