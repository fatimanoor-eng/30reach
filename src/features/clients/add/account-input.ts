// Typed social accounts in Add client (15d team platforms / competitors, 15f manual form): format checks
// only, nothing is charged. Instagram / TikTok / X = handles; Facebook / LinkedIn = page links.
import { parseXHandle } from "../../../lib/client-rules";
import type { Platform } from "../../../lib/platforms";
import { parseHandle } from "../../competitors/competitor-rules";
import type { ParsedInput } from "./add-client-rules";

export function parseAccount(key: Platform | "x", value: string): ParsedInput {
  if (key === "x") {
    const h = parseXHandle(value);
    return h === undefined
      ? { value: null }
      : h
        ? { value: h }
        : { value: null, error: "Use 1–15 letters, numbers or underscores." };
  }
  const r = parseHandle(key, value);
  return r.kind === "ok"
    ? { value: r.handle }
    : r.kind === "empty"
      ? { value: null }
      : { value: null, error: r.message };
}

export const ACCOUNT_PLACEHOLDER: Record<Platform | "x", string> = {
  instagram: "@handle",
  tiktok: "@handle",
  facebook: "Page link",
  linkedin: "Company page link",
  x: "@handle",
};
