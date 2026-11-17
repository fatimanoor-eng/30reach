import { formatShortDate, plural } from "../../lib/format";
import type { Platform, PullProblem, PullStartResponse } from "../../lib/pulls/api";
import type { TaskProgress } from "../../lib/pulls/run-pull";

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** "Found" → "Found’s", "Hims" → "Hims’" */
export const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

const finished = (t: TaskProgress) => t.status === "done" || t.status === "failed";

/** M04 one-liner: "Instagram done · TikTok 3 of 6 brands". */
export function mobileProgressLine(tasks: TaskProgress[]): string {
  return (["instagram", "tiktok"] as Platform[])
    .map((platform) => {
      const list = tasks.filter((t) => t.platform === platform);
      if (list.length === 0) return null;
      const done = list.filter(finished).length;
      if (done === list.length) return `${PLATFORM_LABEL[platform]} done`;
      if (done === 0 && list.every((t) => t.status === "queued"))
        return `${PLATFORM_LABEL[platform]} waiting`;
      return `${PLATFORM_LABEL[platform]} ${done} of ${plural(list.length, "brand")}`;
    })
    .filter(Boolean)
    .join(" · ");
}

/** 05g sentence: "Found’s TikTok handle wasn’t found." / "Ro’s Instagram pull failed." */
export function problemSentence(problems: PullProblem[]): string {
  if (problems.length === 0) return "";
  const one = (p: PullProblem) =>
    p.code === "not_found"
      ? `${possessive(p.brand)} ${PLATFORM_LABEL[p.platform]} handle wasn’t found.`
      : `${possessive(p.brand)} ${PLATFORM_LABEL[p.platform]} pull failed.`;
  if (problems.length === 1) return one(problems[0]);
  const names = problems.map((p) => `${p.brand} ${PLATFORM_LABEL[p.platform]}`);
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)} couldn’t be pulled.`;
}

/** Cost of the chosen platforms (05): expected (≈) and the hard maximum ("up to"). */
export function selectionCost(preview: PullStartResponse, selected: Platform[]) {
  return selected.reduce(
    (acc, p) => ({
      expected: acc.expected + preview.estimate.perPlatform[p].expected,
      max: acc.max + preview.estimate.perPlatform[p].max,
    }),
    { expected: 0, max: 0 },
  );
}

/** Platforms that have brands to pull. */
export const availablePlatforms = (preview: PullStartResponse): Platform[] =>
  (["instagram", "tiktok"] as Platform[]).filter((p) => preview.estimate.perPlatform[p].tasks > 0);

/** 05f: single platforms whose maximum still fits what's left (cheapest first). */
export function fittingPlatforms(preview: PullStartResponse): Platform[] {
  return availablePlatforms(preview)
    .filter((p) => preview.estimate.perPlatform[p].max <= preview.credits.remaining)
    .sort((a, b) => preview.estimate.perPlatform[a].max - preview.estimate.perPlatform[b].max);
}

/** 05 intro: "This pulls the latest public posts for 6 brands and replaces the saved pull from 6 Nov." */
export function refreshIntro(preview: PullStartResponse): string {
  const brands = plural(preview.brands, "brand");
  const last = formatShortDate(preview.lastPullAt);
  return last
    ? `This pulls the latest public posts for ${brands} and replaces the saved pull from ${last}.`
    : `This pulls the latest public posts for ${brands} from the last ${preview.windowDays} days.`;
}

/** Seconds per page call: Firecrawl ~10 s + the 3 s gap (free-plan pacing, one task at a time). */
export const SECONDS_PER_PAGE = 13;

/** "about 7 minutes" for ~60 credits (30 pages). Pages = credits ÷ 2. */
export function durationText(expectedCredits: number): string {
  const minutes = Math.max(1, Math.round((Math.ceil(expectedCredits / 2) * SECONDS_PER_PAGE) / 60));
  return `about ${plural(minutes, "minute")}`;
}
