-- Slice 16a Facebook: Facebook pages as a fourth platform (ScrapeCreators facebook/profile-posts via
-- Firecrawl; followers from AnyAPI facebook/profile). See docs/INTEGRATIONS.md › "Facebook / X spike",
-- docs/DATA_MODEL.md.
--
-- • 'facebook' is allowed wherever a platform is constrained (posts, pull_tasks, ideas, calendar_cards).
--   pulls.platforms (text[]) has no check, so it needs no change.
-- • No new post formats: Facebook uses reel, video, carousel (shown as "Album"), image, article (shown
--   as "Link") and text, which the check already allows.
-- • competitors.facebook_url = canonical page URL (https://www.facebook.com/<slug>), validated in the
--   browser and in check-handle before any credits are spent.
-- • competitors.facebook_followers / facebook_followers_at = the follower count read once (AnyAPI,
--   5 credits) when the page is saved or changed in Competitors. Pulls don't fetch it again; pull-task
--   copies it into pull_tasks.followers.
-- New columns are covered by the existing table-level grants (*_grants.sql) and RLS policies.

-- ───────────────────────────────────────────── competitors: Facebook page
alter table public.competitors
  add column facebook_url text,
  add column facebook_status text not null default 'unchecked'
    check (facebook_status in ('unchecked', 'ok', 'not_found')),
  add column facebook_followers int,
  add column facebook_followers_at timestamptz;

-- ───────────────────────────────────────────── platform checks
alter table public.posts drop constraint posts_platform_check;
alter table public.posts add constraint posts_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook'));

alter table public.pull_tasks drop constraint pull_tasks_platform_check;
alter table public.pull_tasks add constraint pull_tasks_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook'));

alter table public.ideas drop constraint ideas_platform_check;
alter table public.ideas add constraint ideas_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook'));

alter table public.calendar_cards drop constraint calendar_cards_platform_check;
alter table public.calendar_cards add constraint calendar_cards_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook'));

comment on column public.posts.shares is 'TikTok / Facebook shares, LinkedIn reposts; null for Instagram';
comment on column public.posts.views is
  'Instagram reels/videos, TikTok, Facebook videos/reels; null otherwise (all LinkedIn posts)';
comment on column public.posts.likes is 'Instagram/TikTok likes; LinkedIn / Facebook = all reactions';
comment on column public.posts.is_paid is
  'Paid partnership flag from the provider (Instagram, TikTok, Facebook is_paid_partnership)';
