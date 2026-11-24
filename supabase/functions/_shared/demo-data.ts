// Slice 17f: the Demo client ("Demo Wellness Co"). Made-up brands and numbers, dated relative to `now` so
// the dashboards always look current. Pure and seeded (same input → same data); tested in
// demo-data.test.ts. Written by the `reset-demo` Edge Function. Pulls are off for the demo, so these
// handles are never fetched (they're invented and end in ".demo" anyway).

export const DEMO_SLUG = "demo-wellness-co";

export const DEMO_CLIENT = {
  name: "Demo Wellness Co",
  slug: DEMO_SLUG,
  initials: "DW",
  brand_color: "#E9E9E3",
  is_demo: true,
  website: "https://example.com",
  description:
    "A made-up wellness brand for trying 30reach. Every brand, post and number here is invented.",
  industry: "Wellness · supplements",
  audience: "Adults building healthier daily habits",
  country: "US",
  language: "en",
  regulated: ["health", "supplements"],
  audience_is_kids: false,
  health_months: true,
  content_rules: [
    {
      id: "demo-1",
      source: "team",
      rule: "No promises about results or cures",
      why: "Supplements can't claim to treat anything.",
      added_by_name: "Demo",
    },
    {
      id: "demo-2",
      source: "team",
      rule: "Show real routines, not perfect ones",
      why: "Relatable beats aspirational for this audience.",
      added_by_name: "Demo",
    },
  ],
};

const BRANDS = [
  ["Bloomwell", "BW", "bloomwell.demo"],
  ["Kindred Root", "KR", "kindredroot.demo"],
  ["Sunny Sprout Co", "SS", "sunnysprout.demo"],
  ["Tidewell", "TW", "tidewell.demo"],
  ["Morning Mile", "MM", "morningmile.demo"],
] as const;

const TOPICS = [
  ["3 small habits for calmer mornings", ["morningroutine", "wellness"]],
  ["What we eat in a busy week", ["mealprep", "wellness"]],
  ["Hydration check: are you drinking enough?", ["hydration", "selfcare"]],
  ["A 10-minute walk, every day, for a month", ["walking", "habits"]],
  ["Sleep wind-down: our 4 steps", ["sleep", "selfcare"]],
  ["Stretch break at your desk", ["deskstretch", "wellness"]],
  ["Myth or fact? Breakfast edition", ["nutrition", "myths"]],
  ["Behind the scenes at our studio", ["bts", "team"]],
  ["Your questions, answered by our nutritionist", ["askus", "nutrition"]],
  ["Grocery list for a balanced week", ["grocery", "mealprep"]],
] as const;

/** mulberry32: tiny seeded random numbers (0 ≤ x < 1). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export type DemoCompetitor = {
  key: string;
  name: string;
  initials: string;
  instagram_handle: string;
  tiktok_handle: string;
};
export type DemoPull = { key: "previous" | "latest"; started_at: string; finished_at: string };
export type DemoPost = {
  pull: "previous" | "latest";
  competitor: string;
  platform: "instagram" | "tiktok";
  external_id: string;
  url: string;
  posted_at: string;
  format: "reel" | "carousel" | "image" | "video";
  caption: string;
  hashtags: string[];
  likes: number;
  comments: number;
  views: number | null;
  shares: number | null;
};
export type DemoIdea = {
  kind: "note";
  note: string;
  platform: "instagram" | "tiktok";
  format: string;
  tags: string[];
};
export type DemoCard = {
  date: string;
  platform: "instagram" | "tiktok";
  format: string;
  title: string;
  hook: string | null;
  status: "idea" | "drafting" | "approved" | "posted";
  origin: "manual" | "ai";
};

/**
 * All the demo rows for `now`: 5 competitors, 2 saved pulls (8 days ago and yesterday; the latest one has
 * a few posts the previous didn't, for "What's new"), posts over the 30 days before each pull, 6 ideas and
 * 8 calendar cards around today.
 */
export function demoData(now: Date, seed = 30) {
  const rand = seeded(seed);
  const int = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
  const t = now.getTime();
  const pulls: DemoPull[] = [
    {
      key: "previous",
      started_at: new Date(t - 8 * DAY).toISOString(),
      finished_at: new Date(t - 8 * DAY + 240_000).toISOString(),
    },
    {
      key: "latest",
      started_at: new Date(t - 1 * DAY).toISOString(),
      finished_at: new Date(t - 1 * DAY + 240_000).toISOString(),
    },
  ];
  const competitors: DemoCompetitor[] = BRANDS.map(([name, initials, handle], i) => ({
    key: `c${i + 1}`,
    name,
    initials,
    instagram_handle: handle,
    tiktok_handle: handle,
  }));

  // One pool of posts per brand × platform, newest first; each pull sees the ones from its 30 days.
  const pool: Omit<DemoPost, "pull">[] = [];
  competitors.forEach((c, ci) => {
    for (const platform of ["instagram", "tiktok"] as const) {
      const count = int(5, 9);
      for (let i = 0; i < count; i++) {
        const daysAgo = int(0, 34);
        const hour = int(7, 21);
        const [title, tags] = TOPICS[int(0, TOPICS.length - 1)];
        const format =
          platform === "tiktok"
            ? rand() < 0.85
              ? "video"
              : "carousel"
            : (["reel", "carousel", "image"] as const)[int(0, 2)];
        const reach =
          (ci === 0 ? 2.4 : ci === 3 ? 1.6 : 1) *
          (format === "reel" || format === "video" ? 1.8 : 1);
        const likes = Math.round(int(120, 2400) * reach);
        const id = `demo-${c.key}-${platform}-${i + 1}`;
        pool.push({
          competitor: c.key,
          platform,
          external_id: id,
          url: `https://example.com/demo/${id}`,
          posted_at: new Date(t - daysAgo * DAY - (24 - hour) * 3_600_000).toISOString(),
          format,
          caption: `${title} ✨ #${tags.join(" #")}`,
          hashtags: [...tags],
          likes,
          comments: Math.round(likes * (0.02 + rand() * 0.06)),
          views: format === "reel" || format === "video" ? likes * int(8, 30) : null,
          shares: platform === "tiktok" ? Math.round(likes * (0.01 + rand() * 0.05)) : null,
        });
      }
    }
  });
  const posts: DemoPost[] = [];
  for (const p of pulls) {
    const end = Date.parse(p.started_at);
    for (const x of pool) {
      const at = Date.parse(x.posted_at);
      if (at <= end && at > end - 30 * DAY) posts.push({ ...x, pull: p.key });
    }
  }

  const ideas: DemoIdea[] = [
    {
      kind: "note",
      note: "Our own '3 small habits' carousel, with the team's real mornings",
      platform: "instagram",
      format: "carousel",
      tags: ["habits"],
    },
    {
      kind: "note",
      note: "Answer the top 5 questions from comments in a quick video",
      platform: "tiktok",
      format: "video",
      tags: ["faq"],
    },
    {
      kind: "note",
      note: "Grocery list template people can save",
      platform: "instagram",
      format: "image",
      tags: ["mealprep"],
    },
    {
      kind: "note",
      note: "Desk stretch along with us: 60 seconds",
      platform: "tiktok",
      format: "video",
      tags: ["deskstretch"],
    },
    {
      kind: "note",
      note: "Myth or fact series: one myth a week",
      platform: "instagram",
      format: "reel",
      tags: ["myths"],
    },
    {
      kind: "note",
      note: "Behind the scenes: how we test a new blend",
      platform: "instagram",
      format: "reel",
      tags: ["bts"],
    },
  ];
  const day = (n: number) => isoDay(t + n * DAY);
  const cards: DemoCard[] = [
    {
      date: day(-6),
      platform: "instagram",
      format: "carousel",
      title: "3 small habits for calmer mornings",
      hook: "Your morning doesn't need 12 steps.",
      status: "posted",
      origin: "manual",
    },
    {
      date: day(-2),
      platform: "tiktok",
      format: "video",
      title: "Desk stretch break",
      hook: null,
      status: "posted",
      origin: "ai",
    },
    {
      date: day(1),
      platform: "instagram",
      format: "reel",
      title: "What we eat in a busy week",
      hook: "Real food, real week, no perfect plates.",
      status: "approved",
      origin: "manual",
    },
    {
      date: day(3),
      platform: "tiktok",
      format: "video",
      title: "Your questions, answered",
      hook: null,
      status: "drafting",
      origin: "manual",
    },
    {
      date: day(5),
      platform: "instagram",
      format: "image",
      title: "Grocery list for a balanced week",
      hook: null,
      status: "drafting",
      origin: "ai",
    },
    {
      date: day(8),
      platform: "instagram",
      format: "carousel",
      title: "Sleep wind-down: our 4 steps",
      hook: null,
      status: "idea",
      origin: "ai",
    },
    {
      date: day(11),
      platform: "tiktok",
      format: "video",
      title: "A 10-minute walk challenge",
      hook: null,
      status: "idea",
      origin: "manual",
    },
    {
      date: day(15),
      platform: "instagram",
      format: "reel",
      title: "Behind the scenes at our studio",
      hook: null,
      status: "idea",
      origin: "manual",
    },
  ];
  return { client: DEMO_CLIENT, competitors, pulls, posts, ideas, cards };
}
