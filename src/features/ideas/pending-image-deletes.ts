// An idea's image is removed only once its "Deleted the idea · Undo" toast has gone, so Undo can
// bring the idea back with its picture. Until then the image's path waits here, in localStorage:
// • the toast goes (timeout, ✕, replaced) → finishImageDelete removes it
// • Undo → cancelImageDelete keeps it
// • the page closes first → flushImageDeletesOnExit sends the removals with `keepalive`
// • anything still listed on the next visit (e.g. the flush failed) → sweepImageDeletes
// Storage RLS allows the removal for the idea's creator or an admin, the same people who could
// delete the idea.
import { AUTH_STORAGE_KEY, supabase } from "../../lib/supabase";
import { IDEA_BUCKET } from "./ideas-api";

const KEY = "30reach:pending-image-deletes";
/** Older than this on a new visit → Undo can't be pending any more (the toast lasts ~10 s). */
export const SWEEP_AFTER_MS = 30_000;

type Pending = { path: string; at: number };

/** Paths this tab is holding (another tab may be offering Undo for its own). */
const mine = new Set<string>();

function read(): Pending[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(list)
      ? list.filter((p): p is Pending => typeof p?.path === "string" && typeof p?.at === "number")
      : [];
  } catch {
    return [];
  }
}
function write(list: Pending[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the removal still runs while the page is open */
  }
}

export function holdImageDelete(path: string, now = Date.now()): void {
  mine.add(path);
  write([...read().filter((p) => p.path !== path), { path, at: now }]);
}

export function cancelImageDelete(path: string): void {
  mine.delete(path);
  write(read().filter((p) => p.path !== path));
}

/** Removes the image now. Stays listed if that fails, so the next visit tries again. */
export async function finishImageDelete(path: string): Promise<void> {
  const { error } = await supabase.storage.from(IDEA_BUCKET).remove([path]);
  if (!error) cancelImageDelete(path);
}

/** Paths already swept on this page load (effects can run twice in development). */
const swept = new Set<string>();

/** On the next visit: finish removals whose Undo window is long over. Each path once per load. */
export async function sweepImageDeletes(now = Date.now()): Promise<void> {
  const due = read().filter((p) => now - p.at >= SWEEP_AFTER_MS && !swept.has(p.path));
  due.forEach((p) => swept.add(p.path));
  await Promise.all(due.map((p) => finishImageDelete(p.path)));
}

/**
 * The page is closing while Undo is still offered: send the removals now. `keepalive` lets the
 * request outlive the page; supabase-js can't set it, so this calls the Storage API directly with
 * the session saved in localStorage (read synchronously: async work doesn't finish on exit).
 */
export function flushImageDeletesOnExit(): void {
  const pending = read().filter((p) => mine.has(p.path));
  if (!pending.length) return;
  let token: string | undefined;
  try {
    token = (
      JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? "null") as {
        access_token?: string;
      } | null
    )?.access_token;
  } catch {
    return;
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!token || !url || !key) return; // the next visit's sweep will do it
  void fetch(`${url}/storage/v1/object/${IDEA_BUCKET}`, {
    method: "DELETE",
    keepalive: true,
    headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: pending.map((p) => p.path) }),
  }).catch(() => {});
}
