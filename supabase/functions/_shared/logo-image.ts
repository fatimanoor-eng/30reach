// Competitor logos (Discovery 2.0): download → square → 128 × 128 PNG → the private client-logos bucket.
// ImageScript (MIT) — its DENO build: pure JS + WebAssembly codecs loaded from the module's own URL. NOT the
// npm build: that one loads a native Node binary per CPU and crashed scan-site at start-up in the edge
// runtime (26 Nov: "unsupported arch/platform"). Decodes PNG / JPEG / GIF / TIFF; SVG, WebP and ICO are
// skipped (the next candidate is tried). Rule 8: stored small (a few KB) whatever the source size.
//
// NEVER import this file statically: go through logo-safe.ts, which loads it lazily inside try/catch, so a
// failure here can only cost a logo (initials instead), never a scan or a pull.
import { decode, Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { fitsSquare, LOGO_PX, type LogoCandidate, MAX_LOGO_BYTES } from "./logo-logic.ts";
import type { SupabaseClient } from "./server.ts";

/** One image, if it answers with an image type and isn't huge. */
async function download(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    const size = Number(res.headers.get("content-length") ?? 0);
    if (!res.ok || !type.startsWith("image/") || size > MAX_LOGO_BYTES) {
      await res.body?.cancel();
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength <= MAX_LOGO_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

/** Image bytes → a 128 × 128 PNG (centred on a transparent square), or null if it doesn't fit. */
export async function squarePng(
  bytes: Uint8Array,
  kind: LogoCandidate["kind"],
): Promise<Uint8Array | null> {
  try {
    const decoded = await decode(bytes);
    const img = (Array.isArray(decoded) ? decoded[0] : decoded) as Image | undefined;
    if (!img || !fitsSquare(img.width, img.height, kind)) return null;
    const side = Math.max(img.width, img.height);
    const square = new Image(side, side); // transparent
    square.composite(img, Math.floor((side - img.width) / 2), Math.floor((side - img.height) / 2));
    square.resize(LOGO_PX, LOGO_PX);
    return await square.encode(3);
  } catch {
    return null; // SVG / WebP / ICO / broken file
  }
}

/** The first candidate that works, saved at `path` in client-logos. Null when none does. */
export async function saveLogo(
  admin: SupabaseClient,
  candidates: readonly LogoCandidate[],
  path: string,
): Promise<string | null> {
  for (const c of candidates.slice(0, 4)) {
    const bytes = await download(c.url);
    const png = bytes ? await squarePng(bytes, c.kind) : null;
    if (!png) continue;
    const { error } = await admin.storage
      .from("client-logos")
      .upload(path, png, { contentType: "image/png", upsert: true });
    return error ? null : path;
  }
  return null;
}

/** A signed URL for showing a just-saved logo (an hour). */
export async function signedLogoUrl(admin: SupabaseClient, path: string | null) {
  if (!path) return null;
  const { data } = await admin.storage.from("client-logos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
