import { deflateSync, crc32 } from "node:zlib";

/** Fixed "now" for Overview tests (Date only; timers run normally). */
export const NOW = new Date("2026-11-17T12:00:00Z");

export const BRANDS = [
  { id: "c-found", name: "Found", initials: "Fo" },
  { id: "c-hers", name: "Hers", initials: "He" },
  { id: "c-hims", name: "Hims", initials: "Hi" },
  { id: "c-lifemd", name: "LifeMD", initials: "LM" },
  { id: "c-ro", name: "Ro", initials: "Ro" },
  { id: "c-ww", name: "WeightWatchers", initials: "WW" },
];

/**
 * BRANDS as `competitors` rows with accounts (Slice 16b: the platform switch, sidebar and rail show only
 * platforms someone has an account on). Instagram + TikTok for all, a LinkedIn page for Hims, no Facebook
 * page (Facebook tests add one where they need it).
 */
export const COMPETITORS = BRANDS.map((b) => ({
  ...b,
  instagram_handle: b.id.replace("c-", ""),
  tiktok_handle: b.id.replace("c-", ""),
  linkedin_url: b.id === "c-hims" ? "https://www.linkedin.com/company/hims-&-hers/" : null,
  facebook_url: null as string | null,
}));

const CAPTIONS = [
  "3 things nobody tells you about starting treatment",
  "A doctor answers your questions in 30 seconds",
  "What a week of meals looks like on a plan",
  "Your questions, answered by a clinician",
  "Small habits that add up over a month",
  "Myths vs facts: weight-loss medication",
];
const FORMATS = ["reel", "carousel", "image", "video"] as const;

/** Deterministic posts: brand i gets 8 − i posts, engagement scales with `boost`. */
export function makePosts(
  pullId: string,
  pullStart: Date,
  opts: {
    boost?: Record<string, number>;
    prefix?: string;
    withThumbs?: boolean;
    /** Extra hashtag on every 4th post (k % 4 === 1) — e.g. a tag only the latest pull has. */
    extraTag?: string;
    /** Override how many posts a brand gets (default 8 − brand index). */
    counts?: Record<string, number>;
  } = {},
) {
  const posts = [];
  let n = 0;
  for (const [bi, brand] of BRANDS.entries()) {
    for (let k = 0; k < (opts.counts?.[brand.id] ?? 8 - bi); k++) {
      n++;
      const platform = k % 3 === 2 ? "tiktok" : "instagram";
      const daysBack = (k * 3 + bi) % 28; // spread over ~4 weeks
      const posted = new Date(
        pullStart.getTime() - daysBack * 86_400_000 - ((k * 5) % 12) * 3_600_000,
      );
      const base = (1000 - bi * 120) * (opts.boost?.[brand.id] ?? 1);
      posts.push({
        id: `${pullId}-p${n}`,
        competitor_id: brand.id,
        platform,
        external_id: `${opts.prefix ?? ""}${brand.id}-${k}`,
        url: `https://example.com/${brand.id}/${k}`,
        posted_at: posted.toISOString(),
        format: platform === "tiktok" ? (k % 2 ? "video" : "carousel") : FORMATS[k % 3],
        caption: `${CAPTIONS[(bi + k) % CAPTIONS.length]} #glp1${k % 4 === 0 ? " #dryjanuary" : ""}`,
        hashtags: [
          "glp1",
          ...(k % 4 === 0 ? ["dryjanuary"] : []),
          ...(opts.extraTag && k % 4 === 1 ? [opts.extraTag] : []),
        ],
        likes: Math.round(base * (1 + ((k * 7) % 5) / 4)),
        comments: Math.round(base / 12),
        views: platform === "tiktok" ? Math.round(base * 40) : null,
        counts_hidden: false,
        thumbnail_path: opts.withThumbs && k < 2 ? `client-1/${pullId}/${brand.id}-${k}.jpg` : null,
      });
    }
  }
  return posts;
}

const LI_FORMATS = ["text", "image", "document", "video", "article", "poll"] as const;
const LI_CAPTIONS = [
  "We’re hiring clinicians across 12 states. Here’s what the role looks like",
  "What 10,000 patient conversations taught us about access to care",
  "Our 2026 care report: five numbers that surprised our team",
  "Behind the scenes with our pharmacy partners",
  "Why we publish our outcomes data every quarter",
];

/**
 * LinkedIn posts (Slice 15b) as pull-task saves them: likes = reactions, shares = reposts, no views.
 * Brand i gets 7 − i posts; the first two per brand have a thumbnail when `withThumbs`.
 */
export function makeLinkedInPosts(
  pullId: string,
  pullStart: Date,
  opts: { withThumbs?: boolean } = {},
) {
  return BRANDS.flatMap((brand, bi) =>
    Array.from({ length: 7 - bi }, (_, k) => {
      const daysBack = (k * 4 + bi * 2) % 29;
      const base = 400 - bi * 50;
      return {
        id: `${pullId}-li${bi}-${k}`,
        competitor_id: brand.id,
        platform: "linkedin",
        external_id: `li-${brand.id}-${k}`,
        url: `https://www.linkedin.com/feed/update/urn:li:activity:${bi}${k}/`,
        posted_at: new Date(
          pullStart.getTime() - daysBack * 86_400_000 - ((k * 3) % 9) * 3_600_000,
        ).toISOString(),
        format: LI_FORMATS[(k + bi) % LI_FORMATS.length],
        caption: `${LI_CAPTIONS[(bi + k) % LI_CAPTIONS.length]} #digitalhealth${k % 3 === 0 ? " #telehealth" : ""}`,
        hashtags: ["digitalhealth", ...(k % 3 === 0 ? ["telehealth"] : [])],
        likes: Math.round(base * (1 + ((k * 5) % 4) / 3)),
        comments: Math.round(base / 15),
        views: null,
        shares: Math.round(base / 40) + k,
        counts_hidden: false,
        thumbnail_path:
          opts.withThumbs && k < 2 ? `client-1/${pullId}/li-${brand.id}-${k}.jpg` : null,
      };
    }),
  );
}

const FB_FORMATS = ["reel", "article", "image", "video", "carousel", "text"] as const;
const FB_CAPTIONS = [
  "Your morning bagel sandwich, but with more protein",
  "Curious about the different types of protein? Read this",
  "Hot tip: post this in the family group chat",
  "The Thanksgiving appetizer you won’t believe is on plan",
  "Dressing the body you have, and loving it",
];

/**
 * Facebook posts (Slice 16b) as pull-task saves them: likes = reactions, shares = shares, views only on
 * reels / videos. WeightWatchers hits the 12-post cap (4 pages × 3); Ro has 5; nobody else has a page.
 */
export function makeFacebookPosts(
  pullId: string,
  pullStart: Date,
  opts: { withThumbs?: boolean } = {},
) {
  const perBrand: [string, number][] = [
    ["c-ww", 12],
    ["c-ro", 5],
  ];
  return perBrand.flatMap(([brandId, count], bi) =>
    Array.from({ length: count }, (_, k) => {
      const format = FB_FORMATS[(k + bi) % FB_FORMATS.length];
      const video = format === "reel" || format === "video";
      const base = 60 - bi * 20;
      return {
        id: `${pullId}-fb${bi}-${k}`,
        competitor_id: brandId,
        platform: "facebook",
        external_id: `fb-${brandId}-${k}`,
        url: video
          ? `https://www.facebook.com/reel/${bi}${k}00/`
          : `https://www.facebook.com/page/posts/pfbid${bi}${k}`,
        posted_at: new Date(
          pullStart.getTime() - (k * 2 + bi) * 86_400_000 - ((k * 5) % 11) * 3_600_000,
        ).toISOString(),
        format,
        caption: FB_CAPTIONS[(bi + k) % FB_CAPTIONS.length],
        hashtags: [],
        likes: Math.round(base * (1 + ((k * 3) % 5) / 2)),
        comments: Math.round(base / 6) + (k % 3),
        views: video ? 2_000 + k * 950 : null,
        shares: 3 + ((k * 2) % 7),
        counts_hidden: false,
        thumbnail_path:
          opts.withThumbs && k % 3 === 0 ? `client-1/${pullId}/fb-${brandId}-${k}.jpg` : null,
      };
    }),
  );
}

const X_FORMATS = ["text", "image", "video", "carousel", "text"] as const;
const X_CAPTIONS = [
  "Your questions, answered: what to expect in week one",
  "New: same-day visits in 12 more states",
  "Myth: you need a perfect diet to start. Fact: start where you are",
  "A doctor explains GLP-1s in plain words",
];

/** X posts (Slice 17g): Ro posts most, LifeMD a few. Replies / reposts are already dropped by the pull. */
export function makeXPosts(pullId: string, pullStart: Date) {
  const perBrand: [string, string, number][] = [
    ["c-ro", "ro", 9],
    ["c-lifemd", "lifemd", 4],
  ];
  return perBrand.flatMap(([brandId, handle, count], bi) =>
    Array.from({ length: count }, (_, k) => {
      const format = X_FORMATS[(k + bi) % X_FORMATS.length];
      const base = 40 - bi * 15;
      return {
        id: `${pullId}-x${bi}-${k}`,
        competitor_id: brandId,
        platform: "x",
        external_id: `x-${brandId}-${k}`,
        url: `https://x.com/${handle}/status/19${bi}${k}000`,
        posted_at: new Date(
          pullStart.getTime() - (k * 3 + bi) * 86_400_000 - ((k * 7) % 9) * 3_600_000,
        ).toISOString(),
        format,
        caption: X_CAPTIONS[(bi + k) % X_CAPTIONS.length],
        hashtags: [],
        likes: Math.round(base * (1 + ((k * 3) % 5) / 2)),
        comments: 2 + (k % 4),
        views: 1_500 + k * 700,
        shares: 1 + ((k * 2) % 5),
        counts_hidden: false,
        thumbnail_path: null,
      };
    }),
  );
}

const YT_TITLES = [
  "GLP-1s explained by a doctor in 5 minutes",
  "What food noise really is (and how to quiet it)",
  "3 protein swaps for busy weeknights",
  "Myth or fact: you lose muscle on GLP-1s",
  "Our dietitian answers your top questions",
];

/**
 * Slice 18: YouTube uploads for WeightWatchers (8: Shorts and long videos) and Hims (3 long videos).
 * Views, likes, comments and a length on every one; no thumbnails (the YouTube-red block shows).
 */
export function makeYouTubePosts(pullId: string, pullStart: Date) {
  const perBrand: [string, number][] = [
    ["c-ww", 8],
    ["c-hims", 3],
  ];
  return perBrand.flatMap(([brandId, count], bi) =>
    Array.from({ length: count }, (_, k) => {
      const short = bi === 0 && k % 2 === 0;
      return {
        id: `${pullId}-yt${bi}-${k}`,
        competitor_id: brandId,
        platform: "youtube",
        external_id: `yt-${brandId}-${k}`,
        url: short
          ? `https://www.youtube.com/shorts/yt${bi}${k}`
          : `https://www.youtube.com/watch?v=yt${bi}${k}`,
        posted_at: new Date(
          pullStart.getTime() - (k * 3 + bi + 1) * 86_400_000 - ((k * 5) % 7) * 3_600_000,
        ).toISOString(),
        format: short ? "short" : "video",
        caption: YT_TITLES[(bi + k) % YT_TITLES.length],
        hashtags: [],
        likes: short ? 40 + k * 9 : 120 + k * 35 + bi * 60,
        comments: short ? 1 + (k % 3) : 8 + k * 2,
        views: short ? 2_400 + k * 900 : 9_000 + k * 2_500,
        shares: null,
        counts_hidden: false,
        thumbnail_path: null,
        duration_seconds: short ? 35 + k * 4 : 600 + k * 431,
      };
    }),
  );
}

/** Tiny solid-colour PNG for stubbed thumbnails. */
export function solidPng(
  width: number,
  height: number,
  [r, g, b]: [number, number, number],
): Buffer {
  const chunk = (type: string, data: Buffer) => {
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
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
