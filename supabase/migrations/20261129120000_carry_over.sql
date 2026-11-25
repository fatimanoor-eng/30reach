-- Slice 18b: choose platforms on every Refresh; the rest are carried over (no credits).
-- See docs/DATA_MODEL.md › "Slice 18b carry-over".
--
-- • pulls.carried = the platforms this pull didn't fetch itself but copied from the previous pull, each
--   with the date its data really comes from: {"tiktok": "2026-11-16T16:20:00Z"} (a chain of carries keeps
--   the first date). Empty for a pull that fetched everything. pull-finish fills it.
-- • Carried rows are ordinary posts / pull_tasks rows of the new pull (so dashboards, Blip and exports read
--   one snapshot); carried tasks have status 'done', error_code 'carried', 0 credits.
-- Covered by the existing pulls grants and RLS (team read; writes by the Edge Functions' service role).

alter table public.pulls
  add column carried jsonb not null default '{}'::jsonb;

comment on column public.pulls.carried is
  'Platforms copied from the previous pull (not fetched this time) → the ISO date their data comes from';
comment on column public.pull_tasks.error_code is
  'Why a task failed (not_found, quota, …); on a done task: page_cap / budget, or carried (copied from the previous pull, 0 credits)';
