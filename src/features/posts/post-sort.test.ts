import { describe, expect, it } from "vitest";
import type { OverviewPost } from "../overview/metrics";
import { sortPosts } from "./post-sort";

const post = (
  id: string,
  likes: number,
  posted_at: string,
  counts_hidden = false,
): OverviewPost => ({
  id,
  competitor_id: "c",
  platform: "instagram",
  external_id: id,
  url: "https://example.com",
  posted_at,
  format: "reel",
  caption: null,
  hashtags: [],
  likes,
  comments: 0,
  views: null,
  shares: null,
  counts_hidden,
  thumbnail_path: null,
});

const posts = [
  post("old-big", 900, "2026-11-01T10:00:00Z"),
  post("new-small", 100, "2026-11-15T10:00:00Z"),
  post("hidden", 0, "2026-11-16T10:00:00Z", true),
  post("mid", 500, "2026-11-10T10:00:00Z"),
  post("mid-newer", 500, "2026-11-12T10:00:00Z"),
];

describe("sortPosts", () => {
  it("top: likes + comments, ties newer first, hidden counts last", () => {
    expect(sortPosts(posts, "top").map((p) => p.id)).toEqual([
      "old-big",
      "mid-newer",
      "mid",
      "new-small",
      "hidden",
    ]);
  });
  it("newest: by posted date", () => {
    expect(sortPosts(posts, "newest").map((p) => p.id)).toEqual([
      "hidden",
      "new-small",
      "mid-newer",
      "mid",
      "old-big",
    ]);
  });
  it("keeps every post and doesn't mutate the input", () => {
    const copy = [...posts];
    expect(sortPosts(posts, "top")).toHaveLength(5);
    expect(posts).toEqual(copy);
  });
});
