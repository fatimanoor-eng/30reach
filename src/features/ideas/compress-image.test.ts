import { describe, expect, it } from "vitest";
import {
  BUCKET_LIMIT_BYTES,
  fitWithin,
  findEncoding,
  ImageCompressionError,
  imageExtension,
  QUALITIES,
  TARGET_BYTES,
} from "./compress-image";

const KB = 1024;
const webp = (size: number) => new Blob([new Uint8Array(size)], { type: "image/webp" });

describe("fitWithin", () => {
  it("shrinks the long side to 1600 and keeps the shape", () => {
    expect(fitWithin(3200, 1800)).toEqual({ width: 1600, height: 900 });
    expect(fitWithin(1170, 2532)).toEqual({ width: 739, height: 1600 }); // iPhone screenshot
  });

  it("never enlarges a small image", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("keeps at least 1 px on a very thin image", () => {
    expect(fitWithin(10_000, 2)).toEqual({ width: 1600, height: 1 });
  });
});

describe("findEncoding", () => {
  it("stops at the first quality that is small enough", async () => {
    const tried: number[] = [];
    const { blob } = await findEncoding({ width: 1600, height: 900 }, async (_w, _h, q) => {
      tried.push(q);
      return webp(q > 0.7 ? 260 * KB : 150 * KB);
    });
    expect(blob.size).toBe(150 * KB);
    expect(tried).toEqual([0.82, 0.72, 0.62]);
  });

  it("shrinks the image when every quality is still too big", async () => {
    const sizes: number[] = [];
    const result = await findEncoding({ width: 1600, height: 1000 }, async (w) => {
      sizes.push(w);
      return webp(w >= 1600 ? 400 * KB : 180 * KB);
    });
    expect(result.blob.size).toBeLessThanOrEqual(TARGET_BYTES);
    // The size reported is the size actually saved (it's stored for the board's tile shapes).
    expect(result).toMatchObject({ width: 1280, height: 800 });
    expect(sizes.slice(0, QUALITIES.length).every((w) => w === 1600)).toBe(true);
    expect(sizes.at(-1)).toBe(1280);
  });

  it("keeps the smallest try when nothing reaches 200 KB but it fits the bucket", async () => {
    const { blob } = await findEncoding({ width: 600, height: 600 }, async (_w, _h, q) =>
      webp(Math.round(220 * KB + q * 50 * KB)),
    );
    expect(blob.size).toBeGreaterThan(TARGET_BYTES);
    expect(blob.size).toBeLessThanOrEqual(BUCKET_LIMIT_BYTES);
  });

  it("gives up when nothing fits the bucket", async () => {
    await expect(
      findEncoding({ width: 600, height: 600 }, async () => webp(500 * KB)),
    ).rejects.toMatchObject({ reason: "too-big" });
  });

  it("falls back to JPEG with the same size target when the browser can't make WebP", async () => {
    const tried: string[] = [];
    // Like older Safari: asked for WebP, it hands back a PNG.
    const { blob } = await findEncoding({ width: 1600, height: 900 }, async (_w, _h, q, type) => {
      tried.push(`${type}@${q}`);
      if (type === "image/webp") return new Blob([new Uint8Array(900 * KB)], { type: "image/png" });
      return new Blob([new Uint8Array(q > 0.7 ? 240 * KB : 160 * KB)], { type: "image/jpeg" });
    });
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBeLessThanOrEqual(TARGET_BYTES);
    // WebP is asked for once, then JPEG for the rest of the search.
    expect(tried).toEqual([
      "image/webp@0.82",
      "image/jpeg@0.82",
      "image/jpeg@0.72",
      "image/jpeg@0.62",
    ]);
  });

  it("JPEG also shrinks the image when it stays too big", async () => {
    const { blob } = await findEncoding({ width: 1600, height: 1000 }, async (w, _h, _q, type) =>
      type === "image/webp"
        ? new Blob([new Uint8Array(10)], { type: "image/png" })
        : new Blob([new Uint8Array(w >= 1600 ? 400 * KB : 150 * KB)], { type: "image/jpeg" }),
    );
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBe(150 * KB);
  });

  it("fails clearly when the browser can make neither WebP nor JPEG", async () => {
    const err = await findEncoding(
      { width: 100, height: 100 },
      async () => new Blob([new Uint8Array(10)], { type: "image/png" }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImageCompressionError);
    expect((err as ImageCompressionError).reason).toBe("unsupported");
  });
});

describe("imageExtension", () => {
  it("names the stored file by its type", () => {
    expect(imageExtension("image/webp")).toBe("webp");
    expect(imageExtension("image/jpeg")).toBe("jpg");
  });
});
