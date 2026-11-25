-- Slice 18 YouTube: YouTube channels as a sixth platform, read with the official YouTube Data API v3 (free
-- quota, not Firecrawl). See docs/INTEGRATIONS.md › "YouTube spike" › Data API, docs/DATA_MODEL.md.
--
-- • 'youtube' is allowed wherever a platform is constrained (posts, pull_tasks, ideas, calendar_cards).
--   client_platforms rows for 'youtube' already exist (OBU's site links YouTube) and are tracked from now on.
-- • competitors.youtube_handle = the @handle without "@" (lowercase) or a channel id (UC…) from a
--   /channel/ link; youtube_channel_id = the channel id the check / first pull found (pulls skip the
--   handle lookup); youtube_subscribers = the latest subscriber count (rounded by YouTube), refreshed on
--   every check and pull.
-- • posts.format gains 'short' (YouTube Shorts); posts.duration_seconds = a YouTube video's length.
-- New columns are covered by the existing table-level grants (*_grants.sql) and RLS policies.

alter table public.competitors
  add column youtube_handle text,
  add column youtube_status text not null default 'unchecked'
    check (youtube_status in ('unchecked', 'ok', 'not_found')),
  add column youtube_channel_id text,
  add column youtube_subscribers bigint;

alter table public.posts
  add column duration_seconds int check (duration_seconds is null or duration_seconds >= 0);

alter table public.posts drop constraint posts_platform_check;
alter table public.posts add constraint posts_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook', 'x', 'youtube'));

alter table public.posts drop constraint posts_format_check;
alter table public.posts add constraint posts_format_check
  check (format in ('reel', 'carousel', 'image', 'video', 'text', 'document', 'article', 'poll', 'short'));

alter table public.pull_tasks drop constraint pull_tasks_platform_check;
alter table public.pull_tasks add constraint pull_tasks_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook', 'x', 'youtube'));

alter table public.ideas drop constraint ideas_platform_check;
alter table public.ideas add constraint ideas_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook', 'x', 'youtube'));

alter table public.calendar_cards drop constraint calendar_cards_platform_check;
alter table public.calendar_cards add constraint calendar_cards_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook', 'x', 'youtube'));

comment on column public.posts.views is
  'Instagram reels/videos, TikTok, Facebook videos/reels, X (when X reports it), YouTube; null otherwise';
comment on column public.posts.comments is 'Comments (X: replies); YouTube comment count';
comment on column public.posts.duration_seconds is 'YouTube: the video''s length in seconds; null elsewhere';
