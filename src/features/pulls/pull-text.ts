import { formatShortDate, plural } from "../../lib/format";
import { PLATFORM_NAME, PLATFORMS, targetNoun } from "../../lib/platforms";
import type { Platform, PullProblem, PullStartResponse } from "../../lib/pulls/api";
import type { TaskProgress } from "../../lib/pulls/run-pull";

export const PLATFORM_LABEL = PLATFORM_NAME;

export { targetNoun };

const NO_TASKS = { tasks: 0, expected: 0, max: 0 };
/** One platform's estimate (a pull-start from before LinkedIn has no `linkedin` entry). */
export const platformEstimate = (preview: PullStartResponse, p: Platform) =>
  preview.estimate.perPlatform[p] ?? NO_TASKS;

/** "Found" → "Found’s", "Hims" → "Hims’" */
export const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

const finished = (t: TaskProgress) => t.status === "done" || t.status === "failed";

/** M04 one-liner: "Instagram done · TikTok 3 of 6 brands · LinkedIn waiting · Facebook waiting". */
export function mobileProgressLine(tasks: TaskProgress[]): string {
  return PLATFORMS.map((platform) => {
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

/** YouTube's free daily API allowance ran out (resets at midnight Pacific), 18b. */
export const YOUTUBE_LIMIT =
  "YouTube’s free daily limit ran out. The other platforms were pulled. YouTube will work again tomorrow.";
/** Same, when YouTube was all this pull tried (nothing else was pulled). */
export const YOUTUBE_LIMIT_ALONE =
  "YouTube’s free daily limit ran out. YouTube will work again tomorrow.";

/**
 * 05g sentence: "Found’s TikTok handle wasn’t found." / "Ro’s LinkedIn page wasn’t found." /
 * "Ro’s Instagram pull failed." YouTube's daily limit (18b) is said once, first; `othersPulled` = some
 * other platform was pulled (the pull didn't fail).
 */
export function problemSentence(
  problems: PullProblem[],
  { othersPulled = true }: { othersPulled?: boolean } = {},
): string {
  if (problems.length === 0) return "";
  const one = (p: PullProblem) =>
    p.code === "not_found"
      ? `${possessive(p.brand)} ${PLATFORM_LABEL[p.platform]} ${targetNoun(p.platform)} wasn’t found.`
      : `${possessive(p.brand)} ${PLATFORM_LABEL[p.platform]} pull failed.`;
  const limit = problems.some((p) => p.code === "quota")
    ? othersPulled
      ? YOUTUBE_LIMIT
      : YOUTUBE_LIMIT_ALONE
    : "";
  const rest = problems.filter((p) => p.code !== "quota");
  const names = rest.map((p) => `${p.brand} ${PLATFORM_LABEL[p.platform]}`);
  const others =
    rest.length === 0
      ? ""
      : rest.length === 1
        ? one(rest[0])
        : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} couldn’t be pulled.`;
  return [limit, others].filter(Boolean).join(" ");
}

/** Only YouTube's daily limit went wrong: its message already says the rest was pulled. */
export const onlyYouTubeLimit = (problems: PullProblem[]) =>
  problems.length > 0 && problems.every((p) => p.code === "quota");

/** Cost of the chosen platforms (05): expected (≈) and the hard maximum ("up to"). */
export function selectionCost(preview: PullStartResponse, selected: Platform[]) {
  return selected.reduce(
    (acc, p) => ({
      expected: acc.expected + platformEstimate(preview, p).expected,
      max: acc.max + platformEstimate(preview, p).max,
    }),
    { expected: 0, max: 0 },
  );
}

/** Platforms that have brands to pull. */
export const availablePlatforms = (preview: PullStartResponse): Platform[] =>
  PLATFORMS.filter((p) => platformEstimate(preview, p).tasks > 0);

/**
 * 05 / 05f (18b): which platforms start ticked. Every one, except YouTube when Google's daily limit already
 * ran out today. If that doesn't fit the credits left, as many as fit, in the usual order (a free platform
 * always fits).
 */
export function initialSelection(preview: PullStartResponse): Platform[] {
  const all = availablePlatforms(preview).filter(
    (p) => !(p === "youtube" && preview.youtubeLimitToday),
  );
  if (selectionCost(preview, all).max <= preview.credits.remaining) return all;
  const out: Platform[] = [];
  let used = 0;
  for (const p of all) {
    const max = platformEstimate(preview, p).max;
    if (used + max > preview.credits.remaining) continue;
    out.push(p);
    used += max;
  }
  return out;
}

/** The cost shown on a platform's row: "~12 credits", or YouTube's "free (Google's daily allowance)". */
export const rowCost = (preview: PullStartResponse, p: Platform) =>
  p === "youtube"
    ? "free (Google’s daily allowance)"
    : `~${plural(platformEstimate(preview, p).expected, "credit")}`;

/**
 * Under an unticked platform (18b): its data stays, copied from the last pull: "Keeps the 16 Nov data".
 * `from` = the date its saved data comes from; null (never pulled) → "Not pulled this time".
 */
export function keepsLine(from: string | null | undefined): string {
  const d = formatShortDate(from ?? null);
  return d ? `Keeps the ${d} data` : "Not pulled this time";
}

/** 05 intro: "This pulls the latest public posts for 6 brands and replaces the saved pull from 6 Nov." */
export function refreshIntro(preview: PullStartResponse): string {
  const brands = plural(preview.brands, "brand");
  const last = formatShortDate(preview.lastPullAt);
  return last
    ? `This pulls the latest public posts for ${brands} and replaces the saved pull from ${last}. Platforms you untick keep their last data.`
    : `This pulls the latest public posts for ${brands} from the last ${preview.windowDays} days.`;
}

/** Seconds per page call: Firecrawl ~10 s + the 3 s gap (free-plan pacing, one task at a time). */
export const SECONDS_PER_PAGE = 13;

/** "about 7 minutes" for ~60 credits (30 pages). Pages = credits ÷ 2. */
export function durationText(expectedCredits: number): string {
  const minutes = Math.max(1, Math.round((Math.ceil(expectedCredits / 2) * SECONDS_PER_PAGE) / 60));
  return `about ${plural(minutes, "minute")}`;
}

/** How long the pull took, for the toast: "in 45 s", "in 3 min", "in 1 h 5 min". */
export function tookLabel(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `in ${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `in ${h} h ${rest} min` : `in ${h} h`;
}

/** One pull at a time across clients (17a): "OBU Health is pulling right now. Try again in a few minutes." */
export function otherPullingText(name: string) {
  return `${name} is pulling right now. Try again in a few minutes.`;
}

/** No competitor with an account on a tracked platform (first-run hint, Refresh dialog). */
export const noAccountsText = (client: string) =>
  `${client} has no competitors with accounts yet. Add one to run a pull.`;
