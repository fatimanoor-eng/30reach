#!/usr/bin/env node
/**
 * Generates the 30reach favicons from Figma node 7039:23924 ("30" mark), snapped to its 7 × 5 grid.
 *
 *   node scripts/make-favicons.mjs
 *
 * Writes to public/: favicon.ico (16 + 32), icon.svg, apple-touch-icon.png (180),
 * icon-192.png, icon-512.png. Yellow B30 Flash mark on an ink tile, so it reads on light and dark
 * browser tabs. Every block lands on whole pixels → crisp at 16/32 px. No dependencies (node:zlib).
 */
import { writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";

/** The mark: 7 columns × 5 rows of square blocks (Figma 7039:23924, TM omitted). */
// prettier-ignore
export const GRID = [
  "###.##.",
  "...#..#",
  "####..#",
  "...#..#",
  "###.##.",
];
const COLS = GRID[0].length;
const ROWS = GRID.length;

export const INK = [0x0b, 0x0b, 0x0c]; // --color-ink
export const FLASH = [0xf4, 0xeb, 0x02]; // --color-flash (B30 Flash)

/**
 * size: canvas px · cell: block px · radius: tile corner radius (0 = full square, e.g. for iOS,
 * which rounds the icon itself). The mark is centred; offsets must be whole pixels.
 */
export const ICONS = {
  16: { size: 16, cell: 2, radius: 3 },
  32: { size: 32, cell: 4, radius: 6 },
  180: { size: 180, cell: 20, radius: 0 },
  192: { size: 192, cell: 14, radius: 0 }, // mark inside Android's maskable safe zone
  512: { size: 512, cell: 40, radius: 0 },
};

function layout({ size, cell }) {
  const ox = (size - COLS * cell) / 2;
  const oy = (size - ROWS * cell) / 2;
  if (!Number.isInteger(ox) || !Number.isInteger(oy)) {
    throw new Error(`size ${size} / cell ${cell}: mark doesn't land on whole pixels`);
  }
  return { ox, oy };
}

/** Fraction of pixel (x, y) covered by a rounded square (4 × 4 supersampling for smooth corners). */
function tileCoverage(x, y, size, r) {
  if (r === 0) return 1;
  let hits = 0;
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const px = x + (sx + 0.5) / 4;
      const py = y + (sy + 0.5) / 4;
      const cx = Math.min(Math.max(px, r), size - r);
      const cy = Math.min(Math.max(py, r), size - r);
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) hits++;
    }
  }
  return hits / 16;
}

/** RGBA pixels for one icon. */
export function renderRGBA(spec) {
  const { size, cell, radius } = spec;
  const { ox, oy } = layout(spec);
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const col = Math.floor((x - ox) / cell);
      const row = Math.floor((y - oy) / cell);
      const inMark = x >= ox && y >= oy && col < COLS && row < ROWS && GRID[row][col] === "#";
      const [r, g, b] = inMark ? FLASH : INK;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = Math.round(255 * tileCoverage(x, y, size, radius));
    }
  }
  return px;
}

/** Minimal PNG encoder (RGBA, 8-bit, no filtering). */
export function encodePNG(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO container holding PNG images (supported by all current browsers). */
function encodeICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

/** Scalable icon, same geometry as the 32 px tile. Blocks merged per row run, crisp edges. */
function buildSVG() {
  const { size, cell, radius } = ICONS[32];
  const { ox, oy } = layout(ICONS[32]);
  const rects = [];
  GRID.forEach((line, row) => {
    for (const m of line.matchAll(/#+/g)) {
      const x = ox + m.index * cell;
      rects.push(`M${x} ${oy + row * cell}h${m[0].length * cell}v${cell}h-${m[0].length * cell}z`);
    }
  });
  const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <title>30reach</title>
  <rect width="${size}" height="${size}" rx="${radius}" fill="${hex(INK)}"/>
  <path fill="${hex(FLASH)}" shape-rendering="crispEdges" d="${rects.join("")}"/>
</svg>
`;
}

export function png(size) {
  return encodePNG(size, size, renderRGBA(ICONS[size]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = (name, data) => {
    writeFileSync(new URL(`../public/${name}`, import.meta.url), data);
    console.log(`✓ public/${name} (${data.length} bytes)`);
  };
  out("favicon.ico", encodeICO([16, 32].map((size) => ({ size, png: png(size) }))));
  out("icon.svg", buildSVG());
  out("apple-touch-icon.png", png(180));
  out("icon-192.png", png(192));
  out("icon-512.png", png(512));
}
