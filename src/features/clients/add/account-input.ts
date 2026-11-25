// Typed social accounts in Add client (15d team platforms / competitors, 15f manual form): format checks
// only, nothing is charged. Instagram / TikTok / X = handles; Facebook / LinkedIn = page links.
import type { Platform } from "../../../lib/platforms";
import { parseHandle } from "../../competitors/competitor-rules";
import type { ParsedInput } from "./add-client-rules";

export function parseAccount(key: Platform, value: string): ParsedInput {
  const r = parseHandle(key, value);
  return r.kind === "ok"
    ? { value: r.handle }
    : r.kind === "empty"
      ? { value: null }
      : { value: null, error: r.message };
}

export const ACCOUNT_PLACEHOLDER: Record<Platform, string> = {
  instagram: "@handle",
  tiktok: "@handle",
  facebook: "Page link",
  linkedin: "Company page link",
  x: "@handle",
};
