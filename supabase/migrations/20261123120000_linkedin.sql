-- Slice 15a LinkedIn: LinkedIn company pages as a third platform (HarvestAPI via Firecrawl).
-- See docs/INTEGRATIONS.md › "LinkedIn spike" and §3, docs/DATA_MODEL.md.
--
-- • 'linkedin' is allowed wherever a platform is constrained (posts, pull_tasks, ideas, calendar_cards).
--   pulls.platforms (text[]) has no check, so it needs no change.
-- • LinkedIn post formats: text, image (one or more images), document (PDF "carousel"), video,
--   article (shown as "Link"), poll.
-- • competitors.linkedin_url = canonical company page URL (https://www.linkedin.com/company/<slug>/),
--   validated in the browser and in check-handle before any credits are spent.
-- New columns are covered by the existing table-level grants (*_grants.sql) and RLS policies.

-- ───────────────────────────────────────────── competitors: LinkedIn company page
alter table public.competitors
  add column linkedin_url text,
  add column linkedin_status text not null default 'unchecked'
    check (linkedin_status in ('unchecked', 'ok', 'not_found'));

-- ───────────────────────────────────────────── platform checks
alter table public.posts drop constraint posts_platform_check;
alter table public.posts add constraint posts_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin'));

alter table public.pull_tasks drop constraint pull_tasks_platform_check;
alter table public.pull_tasks add constraint pull_tasks_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin'));

alter table public.ideas drop constraint ideas_platform_check;
alter table public.ideas add constraint ideas_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin'));

alter table public.calendar_cards drop constraint calendar_cards_platform_check;
alter table public.calendar_cards add constraint calendar_cards_platform_check
  check (platform in ('instagram', 'tiktok', 'linkedin'));

-- ───────────────────────────────────────────── post formats
alter table public.posts drop constraint posts_format_check;
alter table public.posts add constraint posts_format_check
  check (format in ('reel', 'carousel', 'image', 'video', 'text', 'document', 'article', 'poll'));

comment on column public.posts.shares is 'TikTok shares / LinkedIn reposts; null for Instagram';
comment on column public.posts.views is 'Null for Instagram images/carousels and for all LinkedIn posts';
comment on column public.posts.likes is 'Instagram/TikTok likes; LinkedIn = all reactions';
