-- Slice 17g X: X (Twitter) accounts as a fifth platform (AnyAPI twitter/search via Firecrawl; handles
-- checked with ScrapeCreators x/user-posts). See docs/INTEGRATIONS.md › "Facebook / X spike", docs/DATA_MODEL.md.
--
-- • 'x' is allowed wherever a platform is constrained (posts, pull_tasks, ideas, calendar_cards).
--   pulls.platforms (text[]) and client_platforms.platform (any name) need no change: client_platforms rows
--   for 'x' already exist (OBU's site links X) and are tracked from now on.
-- • No new post formats: X uses text, image, carousel (several photos) and video.
-- • competitors.x_handle = the handle without "@", validated in the browser and in check-handle before any
--   credits are spent. Followers come with every post (authorFollowers), so no follower columns.
-- New columns are covered by the existing table-level grants (*_grants.sql) and RLS policies.

alter table public.competitors
  add column x_handle text,
  add column x_status text not null default 'unchecked'
    check (x_status in ('unchecked', 'ok', 'not_found'));

alter table public.posts drop constraint posts_platform_check;
alter table public.posts add constraint posts_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook', 'x'));

alter table public.pull_tasks drop constraint pull_tasks_platform_check;
alter table public.pull_tasks add constraint pull_tasks_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook', 'x'));

alter table public.ideas drop constraint ideas_platform_check;
alter table public.ideas add constraint ideas_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook', 'x'));

alter table public.calendar_cards drop constraint calendar_cards_platform_check;
alter table public.calendar_cards add constraint calendar_cards_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook', 'x'));

comment on column public.posts.shares is 'TikTok / Facebook shares, LinkedIn reposts, X reposts + quotes; null for Instagram';
comment on column public.posts.saves is 'TikTok saves, X bookmarks';
comment on column public.posts.views is
  'Instagram reels/videos, TikTok, Facebook videos/reels, X (when X reports it); null otherwise';
