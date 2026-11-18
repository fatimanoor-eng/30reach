// Shrinks an image in the browser before it is stored (CLAUDE.md rule 8): at most 1600 px on the
// long side, about 200 KB or less. Uses canvas + createImageBitmap, so no extra library.
// WebP first; browsers that can't make WebP from a canvas (older Safari hands back a PNG instead)
// get JPEG with the same size target. The idea-images bucket accepts WebP or JPEG up to 300 KB
// (DATA_MODEL › Storage buckets).

export const MAX_SIDE = 1600;
export const TARGET_BYTES = 200 * 1024;
export const BUCKET_LIMIT_BYTES = 300 * 1024;
/** Tried in order until the file is small enough. */
export const QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42] as const;
/** If the lowest quality is still too big, the image shrinks by this much and tries again. */
export const SHRINK_STEP = 0.8;
const MIN_SIDE = 480;

export class ImageCompressionError extends Error {
  constructor(
    message: string,
    readonly reason: "not-image" | "unsupported" | "too-big" | "unreadable",
  ) {
    super(message);
    this.name = "ImageCompressionError";
  }
}

/** Size that fits inside max × max, keeping the shape. Never enlarges. Always at least 1 px. */
export function fitWithin(
  width: number,
  height: number,
  max: number = MAX_SIDE,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const scale = max / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type ImageType = "image/webp" | "image/jpeg";

/** File extension for a stored idea image: {client_id}/{idea_id}.webp or .jpg */
export function imageExtension(type: string): "webp" | "jpg" {
  return type === "image/jpeg" ? "jpg" : "webp";
}

type Encode = (
  width: number,
  height: number,
  quality: number,
  type: ImageType,
) => Promise<Blob | null>;

/**
 * The search, separated from the canvas so it can be unit-tested: for each size (starting at
 * `start`, shrinking by SHRINK_STEP), try each quality until the file is ≤ TARGET_BYTES. If none gets
 * there, keep the smallest try that still fits the bucket (≤ 300 KB).
 * Format: WebP. If the browser answers a WebP request with another type, it switches to JPEG for
 * the rest of the search (same qualities, same target). A browser that can't make JPEG either fails.
 */
export type Compressed = { blob: Blob; width: number; height: number };

export async function findEncoding(
  start: { width: number; height: number },
  encode: Encode,
): Promise<Compressed> {
  let { width, height } = start;
  let type: ImageType = "image/webp";
  let best: Compressed | null = null;
  for (;;) {
    for (const q of QUALITIES) {
      let blob = await encode(width, height, q, type);
      if (blob && blob.type !== type && type === "image/webp") {
        type = "image/jpeg";
        blob = await encode(width, height, q, type);
      }
      if (!blob) throw new ImageCompressionError("Couldn't read that image.", "unreadable");
      if (blob.type !== type)
        throw new ImageCompressionError(
          "This browser can't save compressed images.",
          "unsupported",
        );
      if (!best || blob.size < best.blob.size) best = { blob, width, height };
      if (blob.size <= TARGET_BYTES) return { blob, width, height };
    }
    if (Math.max(width, height) * SHRINK_STEP < MIN_SIDE) break;
    width = Math.max(1, Math.round(width * SHRINK_STEP));
    height = Math.max(1, Math.round(height * SHRINK_STEP));
  }
  if (best && best.blob.size <= BUCKET_LIMIT_BYTES) return best;
  throw new ImageCompressionError(
    "That image is too detailed to save. Try a smaller crop.",
    "too-big",
  );
}

/** Any browser-readable image (PNG, JPEG, WebP, GIF…) → compressed WebP (or JPEG) + its size. */
export async function compressImage(file: Blob): Promise<Compressed> {
  if (!file.type.startsWith("image/"))
    throw new ImageCompressionError("That file isn't an image.", "not-image");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // applies the photo's EXIF rotation
  } catch {
    throw new ImageCompressionError("Couldn't read that image.", "unreadable");
  }

  try {
    const canvas = document.createElement("canvas");
    const encode: Encode = (width, height, quality, type) => {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return Promise.resolve(null);
      // White under transparent PNGs, so see-through parts stay readable (and JPEG has no alpha).
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, width, height);
      return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    };
    return await findEncoding(fitWithin(bitmap.width, bitmap.height), encode);
  } finally {
    bitmap.close();
  }
}
