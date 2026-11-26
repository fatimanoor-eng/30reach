-- Discovery 2.0 (25 Nov 2026): competitor logos. A small square mark (128 × 128 PNG, a few KB) in the
-- private client-logos bucket, shown on brand avatars instead of initials.
--   logo_path   scans/c-<uuid>.png (from Add client: the site's square logo or icon) or
--               <client_id>/competitors/<competitor_id>.png (pull-task: the Instagram / TikTok picture)
--   logo_source where it came from: site · instagram · tiktok
-- Nothing else changes: RLS on competitors and the client-logos bucket already cover these.

alter table public.competitors
  add column if not exists logo_path text,
  add column if not exists logo_source text
    check (logo_source is null or logo_source in ('site', 'instagram', 'tiktok'));

comment on column public.competitors.logo_path is
  'Square 128 px PNG in the client-logos bucket (Discovery 2.0); null = initials.';
comment on column public.competitors.logo_source is 'site · instagram · tiktok';
