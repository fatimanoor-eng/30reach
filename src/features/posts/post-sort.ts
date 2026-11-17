import { engagement, type OverviewPost } from "../overview/metrics";

export type PostSort = "top" | "newest";

const time = (p: OverviewPost) => (p.posted_at ? Date.parse(p.posted_at) : 0);

/**
 * Every post, for the expanded "See all" list.
 * • top    — likes + comments, highest first; ties → newer first. Posts with hidden counts can't be
 *            ranked, so they go last (newest first) instead of being dropped.
 * • newest — posted date, newest first.
 */
export function sortPosts(posts: OverviewPost[], sort: PostSort): OverviewPost[] {
  const list = [...posts];
  if (sort === "newest") return list.sort((a, b) => time(b) - time(a));
  return list.sort(
    (a, b) =>
      Number(a.counts_hidden) - Number(b.counts_hidden) ||
      (a.counts_hidden ? 0 : engagement(b) - engagement(a)) ||
      time(b) - time(a),
  );
}
