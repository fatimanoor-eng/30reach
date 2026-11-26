// The only way functions reach the logo code (fix 26 Nov 2026). logo-image.ts pulls in ImageScript and its
// WebAssembly codecs; loading it at start-up once took scan-site down for every request. Here it's loaded
// on first use, inside try/catch and a time limit, and every call is wrapped too: any failure → null, the
// caller carries on without a logo (initials). Nothing in this file can throw.
import type { LogoCandidate } from "./logo-logic.ts";
import type { SupabaseClient } from "./server.ts";

type LogoTools = typeof import("./logo-image.ts");

let loading: Promise<LogoTools | null> | null = null;

/** Load the image code once; null if it can't load (or takes over 8 s). */
export function loadLogoTools(): Promise<LogoTools | null> {
  loading ??= Promise.race([
    import("./logo-image.ts").catch((e) => {
      console.error(`logo tools unavailable: ${(e as Error)?.message ?? e}`);
      return null;
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
  ]).then((tools) => {
    if (!tools) loading = null; // try again on a later request
    return tools;
  });
  return loading;
}

/** saveLogo, but never throws: null = no logo (initials). */
export async function saveLogoSafely(
  admin: SupabaseClient,
  candidates: readonly LogoCandidate[],
  path: string,
): Promise<string | null> {
  if (candidates.length === 0) return null;
  try {
    const tools = await loadLogoTools();
    return tools ? await tools.saveLogo(admin, candidates, path) : null;
  } catch (e) {
    console.error(`logo skipped: ${(e as Error)?.message ?? e}`);
    return null;
  }
}

/** A signed URL for a saved logo, or null; never throws. */
export async function signedLogoUrlSafely(
  admin: SupabaseClient,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = await admin.storage.from("client-logos").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
